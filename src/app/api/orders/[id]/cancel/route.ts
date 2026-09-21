import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { releaseClaimForOrder } from '@/lib/coupons-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/**
 * POST /api/orders/[id]/cancel — 取消订单（管理员）
 * 仅未确认的订单可取消；已确认（paid）不允许取消（卡密已派发）。
 * 带优惠券的订单：取消即释放占用的券（回到可用状态，用户可再用）。
 */
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const db = supabaseAdmin();
  const { data: order, error } = await db
    .from('orders')
    .select('id, status')
    .eq('id', ctx.params.id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!order) return fail('订单不存在', 404);
  if (order.status === 'paid') return fail('订单已确认收款，无法取消', 409);
  if (order.status === 'canceled') return ok({ status: 'canceled' });

  const { error: updErr } = await db
    .from('orders')
    .update({ status: 'canceled' })
    .eq('id', ctx.params.id);
  if (updErr) return fail(updErr.message, 500);

  // 释放该单占用的优惠券（未核销的才放回；已核销的不动）
  try {
    await releaseClaimForOrder(db, ctx.params.id);
  } catch (e) {
    // 释放失败不阻断取消：券停在占用态，后台可再次取消同一单触发重试
    console.warn('[order-cancel] 释放优惠券失败:', e instanceof Error ? e.message : e);
  }

  return ok({ status: 'canceled' });
}

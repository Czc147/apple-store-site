import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import type { Order, OrderItem } from '@/lib/order-types';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/**
 * GET /api/orders/[id] — 订单详情（管理员）
 * 返回订单头 + 行项（按 line_index 排序）。
 */
export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const db = supabaseAdmin();
  const { data: order, error } = await db
    .from('orders')
    .select('*')
    .eq('id', ctx.params.id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!order) return fail('订单不存在', 404);

  const { data: items, error: itemsErr } = await db
    .from('order_items')
    .select('*')
    .eq('order_id', (order as { id: string }).id)
    .order('line_index', { ascending: true });
  if (itemsErr) return fail(itemsErr.message, 500);

  return ok({ order: order as Order, items: (items ?? []) as OrderItem[] });
}

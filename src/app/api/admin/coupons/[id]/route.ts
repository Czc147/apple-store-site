import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { parseCouponInput } from '@/lib/coupons-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

type Ctx = { params: { id: string } };

/**
 * PUT /api/admin/coupons/:id — 编辑券（需管理员）
 * 入参与新建一致（整体覆盖）；已被领取的券改面额/门槛只影响后续使用
 * （专属码仍有效，结算时按券的新配置校验）。
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = (await parseBody(req)) as Record<string, unknown> | null;
  const parsed = parseCouponInput(body);
  if (!parsed.ok) return fail(parsed.error);

  const db = supabaseAdmin();
  const { data: existing, error: findErr } = await db
    .from('coupons')
    .select('id')
    .eq('id', params.id)
    .maybeSingle();
  if (findErr) return fail(findErr.message, 500);
  if (!existing) return fail('优惠券不存在', 404);

  const { data, error } = await db
    .from('coupons')
    .update(parsed.value)
    .eq('id', params.id)
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok(data);
}

/**
 * DELETE /api/admin/coupons/:id — 删除券（需管理员）
 * 级联删除其领取记录（coupon_claims.coupon_id on delete cascade）：
 * 已使用过该券的订单不受影响（订单上只存码快照与优惠金额）。
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('coupons')
    .delete()
    .eq('id', params.id)
    .select('id');
  if (error) return fail(error.message, 500);
  if ((data ?? []).length === 0) return fail('优惠券不存在', 404);
  return ok({ deleted: true });
}

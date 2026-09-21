import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { parseOrderItems, resolveOrderItems } from '@/lib/orders-server';
import { validateCouponCode } from '@/lib/coupons-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/**
 * POST /api/coupons/validate — 用券试算（登录用户，Bearer 鉴权）
 *
 * 请求体：{ code, items: [{ ref_type, ref_id, quantity }] }
 * 与下单走同一套服务端解析（lib/orders-server）算出原价，再校验券并给出
 * 优惠金额与实付 —— 保证「试算看到的数」和「下单落库的数」一致。
 * 真正的权威校验在下单时再做一遍（本接口只是预览，不锁券）。
 *
 * 响应：{ code, coupon_id, name, type, value, original_total, discount_amount, payable }
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);
  if (!rateLimit('coupon-validate', getClientIp(req), 40, 60_000)) {
    return fail('操作过于频繁，请稍后再试', 429);
  }

  const body = await parseBody(req);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!code) return fail('请输入优惠码');

  const parsed = parseOrderItems(body?.items);
  if (!parsed.ok) return fail(parsed.error);

  const db = supabaseAdmin();
  const resolved = await resolveOrderItems(db, parsed.items);
  if (!resolved.ok) return fail(resolved.error, resolved.status);

  const check = await validateCouponCode(db, code, user.id, Number(resolved.total));
  if (!check.ok) return fail(check.error, check.status);

  return ok({
    code: check.claim.code,
    coupon_id: check.coupon.id,
    name: check.coupon.name,
    type: check.coupon.type,
    value: Number(check.coupon.value),
    original_total: Number(resolved.total),
    discount_amount: check.discount,
    payable: check.payable,
  });
}

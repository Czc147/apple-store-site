import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { mapClaimError } from '@/lib/coupons-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 专属码长度与字符集（去掉易混 0/O/1/I）：CP- + 12 位 */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 12;
/** 码撞库重试次数（32^12 空间下几乎不会发生） */
const MAX_CODE_TRIES = 5;

/** 生成一码一人专属码：CP-XXXXXXXXXXXX */
function genCouponCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    s += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return `CP-${s}`;
}

/**
 * POST /api/coupons/claim — 领取优惠券（登录用户，Bearer 鉴权）
 *
 * 请求体：{ coupon_id }
 * 校验与写入全部在 RPC claim_coupon 里原子完成（行锁券模板）：
 * 启用 / 生效时间窗 / 余量 / 每人限领 —— 任一不过返回对应文案。
 * 专属码服务端生成（unique 兜底，撞码重试）。
 *
 * 响应 201：{ claim: { id, code, claimed_at }, coupon: { id, name, type, value, min_amount, valid_to } }
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);
  if (!rateLimit('coupon-claim', getClientIp(req), 20, 60_000)) {
    return fail('操作过于频繁，请稍后再试', 429);
  }

  const body = await parseBody(req);
  const couponId = typeof body?.coupon_id === 'string' ? body.coupon_id.trim() : '';
  if (!couponId) return fail('coupon_id 为必填字段');

  const db = supabaseAdmin();

  const { data: coupon, error: couponErr } = await db
    .from('coupons')
    .select('id, name, type, value, min_amount, valid_to')
    .eq('id', couponId)
    .maybeSingle();
  if (couponErr) return fail(couponErr.message, 500);
  if (!coupon) return fail('优惠券不存在', 404);

  // 撞码重试：code 上有唯一约束，重试几次基本必然成功
  for (let attempt = 0; attempt < MAX_CODE_TRIES; attempt++) {
    const code = genCouponCode();
    const { data: claim, error } = await db.rpc('claim_coupon', {
      p_coupon_id: couponId,
      p_user_id: user.id,
      p_code: code,
    });
    if (!error) {
      const row = claim as { id: string; code: string; claimed_at: string } | null;
      return ok({ claim: row, coupon }, 201);
    }
    // 23505：码撞库（极低概率）→ 换码重试；其余错误按业务语义映射文案
    const msg = error.message ?? '';
    const isDuplicateCode = (error as { code?: string }).code === '23505' && msg.includes('code');
    if (isDuplicateCode && attempt < MAX_CODE_TRIES - 1) continue;

    const isLimit = msg.includes('COUPON_LIMIT_REACHED');
    const isSoldOut = msg.includes('COUPON_SOLD_OUT');
    return fail(
      mapClaimError(msg),
      isLimit || isSoldOut ? 409 : msg.includes('COUPON_NOT_FOUND') ? 404 : 409,
    );
  }

  return fail('领取失败，请稍后再试', 500);
}

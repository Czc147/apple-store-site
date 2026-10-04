import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { claimFingerprint } from '@/lib/claim-fingerprint';
// 码生成抽到 lib/coupons-server 共用 —— 自助领券与「卡券订阅」发券必须是同一种码
import { genCouponCode, mapClaimError } from '@/lib/coupons-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 码撞库重试次数（32^12 空间下几乎不会发生） */
const MAX_CODE_TRIES = 5;

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
  const deviceId = typeof body?.device_id === 'string' ? body.device_id.trim() : '';
  if (!deviceId || deviceId.length > 128) {
    return fail('请刷新页面后重新领取');
  }
  const fingerprint = claimFingerprint(req, deviceId);

  const db = supabaseAdmin();

  const { data: restricted, error: restrictionError } = await db.rpc('has_active_account_restriction', {
    p_user_id: user.id,
    p_scope: 'coupon',
  });
  if (restrictionError) {
    return fail(`领券风控检查失败：${restrictionError.message}`, 500);
  }
  if (restricted === true) return fail('账号已被限制领取优惠券，如有疑问请联系客服', 403);

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
      p_ip_hash: fingerprint.ipHash,
      p_device_hash: fingerprint.deviceHash,
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
    const isBlocked = msg.includes('COUPON_CLAIM_BLOCKED');
    return fail(
      mapClaimError(msg),
      isBlocked
        ? 429
        : isLimit || isSoldOut
          ? 409
          : msg.includes('COUPON_NOT_FOUND')
            ? 404
            : 409,
    );
  }

  return fail('领取失败，请稍后再试', 500);
}

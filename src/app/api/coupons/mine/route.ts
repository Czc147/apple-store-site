import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { couponStateOf } from '@/lib/coupons-server';
import type { Coupon, CouponClaim, CouponState } from '@/lib/coupon-types';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 我的券状态：可用 / 已用于订单（占用中）/ 已使用 / 已过期 / 已停用 */
export type MyCouponStatus = 'available' | 'locked' | 'used' | 'expired' | 'disabled';

export interface MyCoupon {
  claim: Pick<CouponClaim, 'id' | 'code' | 'claimed_at' | 'used_at' | 'order_id'>;
  coupon: Pick<Coupon, 'id' | 'name' | 'type' | 'value' | 'min_amount' | 'valid_from' | 'valid_to' | 'activity_id'>;
  status: MyCouponStatus;
}

function statusOf(
  coupon: Coupon,
  claim: Pick<CouponClaim, 'used_at' | 'order_id'>,
): MyCouponStatus {
  if (claim.used_at) return 'used';
  if (claim.order_id) return 'locked';
  const state: CouponState = couponStateOf(coupon, 0);
  if (state === 'expired') return 'expired';
  if (state === 'disabled') return 'disabled';
  return 'available';
}

/**
 * GET /api/coupons/mine — 我领取的优惠券（登录用户，Bearer 鉴权）
 *
 * 返回全部领取记录（含已使用 / 已过期）+ 券模板信息，按领取时间倒序。
 * 用户拿到专属码后在这里随时回看（结账时复制粘贴）。
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('coupon_claims')
    .select('id, code, claimed_at, used_at, order_id, coupons(*)')
    .eq('user_id', user.id)
    .order('claimed_at', { ascending: false });
  if (error) return fail(error.message, 500);

  const items: MyCoupon[] = [];
  for (const row of (data ?? []) as Array<{
    id: string;
    code: string;
    claimed_at: string;
    used_at: string | null;
    order_id: string | null;
    coupons: Coupon | Coupon[] | null;
  }>) {
    const coupon = (Array.isArray(row.coupons) ? row.coupons[0] : row.coupons) as Coupon | null;
    if (!coupon) continue; // 券被删除（活动删除级联）后残留的领券记录：忽略
    const claim = {
      id: row.id,
      code: row.code,
      claimed_at: row.claimed_at,
      used_at: row.used_at,
      order_id: row.order_id,
    };
    items.push({
      claim,
      coupon: {
        id: coupon.id,
        name: coupon.name,
        type: coupon.type,
        value: coupon.value,
        min_amount: coupon.min_amount,
        valid_from: coupon.valid_from,
        valid_to: coupon.valid_to,
        activity_id: coupon.activity_id,
      },
      status: statusOf(coupon, claim),
    });
  }

  return ok({ items });
}

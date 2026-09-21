import type { Coupon, CouponClaim, CouponWithState } from '@/lib/coupon-types';

/** GET /api/coupons/mine 的单条（与路由 src/app/api/coupons/mine/route.ts 的 MyCoupon 对应） */
export interface MyCouponItem {
  claim: Pick<CouponClaim, 'id' | 'code' | 'claimed_at' | 'used_at' | 'order_id'>;
  coupon: Pick<
    Coupon,
    'id' | 'name' | 'type' | 'value' | 'min_amount' | 'valid_from' | 'valid_to' | 'activity_id'
  >;
  status: 'available' | 'locked' | 'used' | 'expired' | 'disabled';
}

/** 我的券 → 共用券行卡（CouponRowCard）所需的形状 */
export function toCouponRow(item: MyCouponItem): CouponWithState {
  return {
    ...item.coupon,
    enabled: item.status !== 'disabled',
    total_qty: null,
    per_user_limit: 1,
    created_at: item.claim.claimed_at,
    claimed_count: 0,
    my_claim_count: 1,
    remaining: null,
    // used_at / order_id 已带全，徽章状态由 claimStateBadge 判定
    my_claim: item.claim,
  };
}

/** 排序：可使用 → 订单占用 → 已使用/已过期（同组内按领取时间倒序，由接口保证） */
const STATUS_WEIGHT: Record<MyCouponItem['status'], number> = {
  available: 0,
  locked: 1,
  used: 2,
  expired: 3,
  disabled: 4,
};

export function sortMyCoupons(items: MyCouponItem[]): MyCouponItem[] {
  return [...items].sort((a, b) => STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status]);
}

/** 可用张数（我的券卡片的副标题用） */
export function countAvailable(items: MyCouponItem[]): number {
  return items.filter((i) => i.status === 'available').length;
}

/**
 * 还剩几天到期（今天到期 = 0；已过期 = 负数；无有效期 = null）。
 * 用 floor 而非 ceil：不足 24 小时的（比如 2 小时后到期）算「今天到期」，
 * ceil 会把它说成「1 天后过期」——那是会误导用户的说法。
 */
export function daysUntilExpiry(validTo: string | null | undefined, now: number = Date.now()): number | null {
  if (!validTo) return null;
  const t = Date.parse(validTo);
  if (!Number.isFinite(t)) return null;
  return Math.floor((t - now) / 86400000);
}

/**
 * 即将过期张数（被动提醒用，UI 升级后的增量）：
 * 只数「还可用、且 ≤ 阈值天数」的券——已用/已过期不算。
 * 放到我的券卡片的收起态上，用户不用展开就能看到该赶紧用了。
 */
export function countExpiringSoon(items: MyCouponItem[], withinDays = 3): number {
  return items.filter((i) => {
    if (i.status !== 'available') return false;
    const d = daysUntilExpiry(i.coupon.valid_to);
    return d !== null && d >= 0 && d <= withinDays;
  }).length;
}

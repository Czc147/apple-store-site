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

import type { Coupon, CouponClaim, CouponWithState } from '@/lib/coupon-types';

/** GET /api/coupons/mine 的单条（与路由 src/app/api/coupons/mine/route.ts 的 MyCoupon 对应） */
export interface MyCouponItem {
  claim: Pick<CouponClaim, 'id' | 'code' | 'claimed_at' | 'used_at' | 'order_id'>;
  coupon: Pick<
    Coupon,
    | 'id'
    | 'name'
    | 'type'
    | 'value'
    | 'min_amount'
    | 'valid_from'
    | 'valid_to'
    | 'activity_id'
    | 'total_qty'
  >;
  status: 'available' | 'not_started' | 'locked' | 'used' | 'expired' | 'disabled';
  /** 全站已领数（判「已领完」用） */
  claimed_count: number;
  /** 还剩多少张（null = 不限量） */
  remaining: number | null;
}

/** 我的券 → 共用券行卡（CouponRowCard）所需的形状 */
export function toCouponRow(item: MyCouponItem): CouponWithState {
  return {
    ...item.coupon,
    enabled: item.status !== 'disabled',
    // 固定传 null：`/api/coupons/mine` 已经把这**张**券的实际有效期
    // （配了"发券后 N 天"就按领取时刻现算）折算进 valid_from / valid_to 了，
    // 所以到这里就是"固定窗"语义。UI 不需要再看到那个 N
    valid_days_after_issue: null,
    // 透传真实数据（原来硬编码 null/0，「已领完」判不出来）
    total_qty: item.coupon.total_qty,
    per_user_limit: 1,
    created_at: item.claim.claimed_at,
    claimed_count: item.claimed_count,
    my_claim_count: 1,
    remaining: item.remaining,
    // used_at / order_id 已带全，徽章状态由 claimStateBadge 判定
    my_claim: item.claim,
  };
}

/**
 * 排序权重：可使用 → 未开始 → 订单占用 → 已使用 → 已过期 → 已停用
 * （同组内按领取时间倒序，由接口保证）。
 * ⚠️ 新增状态必须在这里补一项，否则它会排到最后（TS 会拦，别绕过）。
 */
const STATUS_WEIGHT: Record<MyCouponItem['status'], number> = {
  available: 0,
  not_started: 1,
  locked: 2,
  used: 3,
  expired: 4,
  disabled: 5,
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

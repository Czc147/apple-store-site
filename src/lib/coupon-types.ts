/** 优惠券类型定义（与 supabase/migrations/022_coupons.sql 对应） */

/** 券类型：满减 / 折扣 */
export const COUPON_TYPE = {
  /** 满减：value = 减免金额（元） */
  FIXED: 'fixed',
  /** 折扣：value = 减免百分比（1–99，如 20 表示减 20%） */
  PERCENT: 'percent',
} as const;

export type CouponType = (typeof COUPON_TYPE)[keyof typeof COUPON_TYPE];

export const COUPON_TYPE_LABEL: Record<CouponType, string> = {
  fixed: '满减',
  percent: '折扣',
};

/** 券模板 */
export interface Coupon {
  id: string;
  activity_id: string;
  name: string;
  type: CouponType;
  /** fixed = 减免金额（元）；percent = 减免百分比 */
  value: number | string;
  /** 用券门槛：订单原价需 ≥ 该金额，0 = 无门槛 */
  min_amount: number | string;
  valid_from: string | null;
  valid_to: string | null;
  /** 总张数；null = 不限量 */
  total_qty: number | null;
  per_user_limit: number;
  enabled: boolean;
  created_at: string;
}

/** 领取记录（专属码） */
export interface CouponClaim {
  id: string;
  coupon_id: string;
  user_id: string;
  code: string;
  claimed_at: string;
  used_at: string | null;
  order_id: string | null;
}

/** 活动页展示用：券模板 + 余量 + 我的领取状态 */
export interface CouponWithState extends Coupon {
  /** 已领取张数 */
  claimed_count: number;
  /** 剩余张数（不限量 = null） */
  remaining: number | null;
  /** 当前用户的领取记录（未登录 / 未领取 = null） */
  my_claim: Pick<CouponClaim, 'id' | 'code' | 'claimed_at' | 'used_at' | 'order_id'> | null;
}

/** 券的可用状态（前端展示用） */
export type CouponState = 'active' | 'not_started' | 'expired' | 'sold_out' | 'disabled';

/** 结算预览：POST /api/coupons/validate 响应 */
export interface CouponPreview {
  code: string;
  coupon_id: string;
  name: string;
  type: CouponType;
  value: number;
  /** 订单原价（服务端按目标表现算） */
  original_total: number;
  /** 优惠金额 */
  discount_amount: number;
  /** 实付 */
  payable: number;
}

/** 券面额展示文案：满 100 减 10 / 减 20% */
export function couponValueText(coupon: Pick<Coupon, 'type' | 'value'>): string {
  const v = Number(coupon.value);
  return coupon.type === COUPON_TYPE.PERCENT ? `减 ${v}%` : `减 ¥${v.toFixed(2)}`;
}

/** 门槛展示文案 */
export function couponThresholdText(coupon: Pick<Coupon, 'min_amount'>): string {
  const m = Number(coupon.min_amount);
  return m > 0 ? `满 ¥${m.toFixed(2)} 可用` : '无门槛';
}

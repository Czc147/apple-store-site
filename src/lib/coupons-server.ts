/**
 * 优惠券服务端工具（路由与后台接口共用）。
 * ⚠️ 仅供服务端（route handler / server component）import。
 */
import type { supabaseAdmin } from '@/lib/supabase/admin';
import {
  COUPON_TYPE,
  type Coupon,
  type CouponState,
  type CouponType,
  type CouponWithState,
} from '@/lib/coupon-types';

const VALID_COUPON_TYPES: CouponType[] = Object.values(COUPON_TYPE);
const MAX_NAME_LEN = 60;
const MAX_AMOUNT = 100000;

/** 券配置入参（后台新建/编辑共用） */
export interface CouponInput {
  activity_id: string;
  name: string;
  type: CouponType;
  value: number;
  min_amount: number;
  valid_from: string | null;
  valid_to: string | null;
  total_qty: number | null;
  per_user_limit: number;
  enabled: boolean;
}

/**
 * 解析并校验券配置（/api/admin/coupons 新建与 /api/admin/coupons/[id] 编辑共用）：
 * 折扣类限制 1–99（100 折 = 白送，实付 0 无法收款）；满减金额 > 0；
 * 门槛 ≥ 0；时间窗可空（空 = 不限期），成对给出时需 起 < 止。
 */
export function parseCouponInput(
  body: Record<string, unknown> | null,
): { ok: true; value: CouponInput } | { ok: false; error: string } {
  const activityId = typeof body?.activity_id === 'string' ? body.activity_id.trim() : '';
  if (!activityId) return { ok: false, error: '请选择所属活动（优惠券挂在活动下）' };

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > MAX_NAME_LEN) {
    return { ok: false, error: `券名称需为 1-${MAX_NAME_LEN} 个字符` };
  }

  const type = body?.type as CouponType;
  if (!VALID_COUPON_TYPES.includes(type)) return { ok: false, error: 'type 必须为 fixed / percent' };

  const value = Number(body?.value);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: '面额必须大于 0' };
  if (type === COUPON_TYPE.PERCENT && (value < 1 || value > 99)) {
    return { ok: false, error: '折扣百分比需在 1–99 之间（100 等于白送，实付为 0 无法收款）' };
  }
  if (type === COUPON_TYPE.FIXED && value > MAX_AMOUNT) {
    return { ok: false, error: `满减金额不能超过 ${MAX_AMOUNT}` };
  }

  const minAmount = Number(body?.min_amount ?? 0);
  if (!Number.isFinite(minAmount) || minAmount < 0 || minAmount > MAX_AMOUNT) {
    return { ok: false, error: `用券门槛需在 0-${MAX_AMOUNT} 之间（0 = 无门槛）` };
  }

  const toIso = (v: unknown): string | null => {
    if (typeof v !== 'string' || !v.trim()) return null;
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  };
  const validFrom = toIso(body?.valid_from);
  const validTo = toIso(body?.valid_to);
  if (body?.valid_from && !validFrom) return { ok: false, error: '生效时间格式不正确' };
  if (body?.valid_to && !validTo) return { ok: false, error: '失效时间格式不正确' };
  if (validFrom && validTo && Date.parse(validFrom) >= Date.parse(validTo)) {
    return { ok: false, error: '失效时间必须晚于生效时间' };
  }

  const rawQty = body?.total_qty;
  let totalQty: number | null = null;
  if (rawQty !== null && rawQty !== undefined && rawQty !== '') {
    const n = Number(rawQty);
    if (!Number.isInteger(n) || n <= 0 || n > 1000000) {
      return { ok: false, error: '总张数需为正整数（留空 = 不限量）' };
    }
    totalQty = n;
  }

  const rawLimit = Number(body?.per_user_limit ?? 1);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
    return { ok: false, error: '每人限领需为 1-100 的整数' };
  }

  return {
    ok: true,
    value: {
      activity_id: activityId,
      name,
      type,
      value: Math.round(value * 100) / 100,
      min_amount: Math.round(minAmount * 100) / 100,
      valid_from: validFrom,
      valid_to: validTo,
      total_qty: totalQty,
      per_user_limit: rawLimit,
      enabled: typeof body?.enabled === 'boolean' ? body.enabled : true,
    },
  };
}

/** 券模板行（numeric 从 PostgREST 回来是字符串，统一在这些工具里转数字） */
type CouponRow = Coupon;

/** 券在「现在」的可用状态（余量与时间窗都算上） */
export function couponStateOf(
  coupon: Pick<Coupon, 'enabled' | 'valid_from' | 'valid_to' | 'total_qty'>,
  claimedCount: number,
  now: number = Date.now(),
): CouponState {
  if (!coupon.enabled) return 'disabled';
  if (coupon.valid_from && now < Date.parse(coupon.valid_from)) return 'not_started';
  if (coupon.valid_to && now > Date.parse(coupon.valid_to)) return 'expired';
  if (coupon.total_qty !== null && claimedCount >= coupon.total_qty) return 'sold_out';
  return 'active';
}

export const COUPON_STATE_LABEL: Record<CouponState, string> = {
  active: '可领取',
  not_started: '未开始',
  expired: '已结束',
  sold_out: '已领完',
  disabled: '已停用',
};

/**
 * 优惠金额（元，两位小数）：
 * - fixed：value 直接减免，但不超过订单原价；
 * - percent：原价 × value%，四舍五入到分。
 * 约定：优惠后实付必须 > 0，由调用方校验（0 元订单没有收款码可扫）。
 */
export function computeDiscount(
  coupon: Pick<Coupon, 'type' | 'value'>,
  originalTotal: number,
): number {
  const raw =
    coupon.type === COUPON_TYPE.PERCENT
      ? (originalTotal * Number(coupon.value)) / 100
      : Number(coupon.value);
  const capped = Math.min(raw, originalTotal);
  return Math.round(capped * 100) / 100;
}

/** RPC claim_coupon 抛出的错误码 → 用户可读文案 */
export function mapClaimError(message: string): string {
  if (message.includes('COUPON_NOT_FOUND')) return '优惠券不存在';
  if (message.includes('COUPON_DISABLED')) return '该优惠券已停用';
  if (message.includes('COUPON_NOT_STARTED')) return '该优惠券还没开始发放';
  if (message.includes('COUPON_EXPIRED')) return '该优惠券已过期';
  if (message.includes('COUPON_SOLD_OUT')) return '该优惠券已被领完';
  if (message.includes('COUPON_LIMIT_REACHED')) return '你已达到该券的领取上限';
  return message;
}

/** 批量取若干活动下的券（含领取数与我领的），按创建时间排序 */
export async function loadCouponsForActivities(
  db: ReturnType<typeof supabaseAdmin>,
  activityIds: string[],
  userId: string | null,
): Promise<Map<string, CouponWithState[]>> {
  const map = new Map<string, CouponWithState[]>();
  const ids = Array.from(new Set(activityIds.filter(Boolean)));
  if (ids.length === 0) return map;

  const { data: coupons, error } = await db
    .from('coupons')
    .select('*')
    .in('activity_id', ids)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const list = (coupons ?? []) as CouponRow[];
  if (list.length === 0) return map;

  const couponIds = list.map((c) => c.id);
  const { data: claims, error: claimErr } = await db
    .from('coupon_claims')
    .select('id, coupon_id, user_id, code, claimed_at, used_at, order_id')
    .in('coupon_id', couponIds);
  if (claimErr) throw new Error(claimErr.message);

  const rows = (claims ?? []) as Array<{
    id: string;
    coupon_id: string;
    user_id: string;
    code: string;
    claimed_at: string;
    used_at: string | null;
    order_id: string | null;
  }>;

  const countByCoupon = new Map<string, number>();
  const mineByCoupon = new Map<string, (typeof rows)[number]>();
  const mineCountByCoupon = new Map<string, number>();
  for (const r of rows) {
    countByCoupon.set(r.coupon_id, (countByCoupon.get(r.coupon_id) ?? 0) + 1);
    if (userId && r.user_id === userId) {
      mineByCoupon.set(r.coupon_id, r);
      mineCountByCoupon.set(r.coupon_id, (mineCountByCoupon.get(r.coupon_id) ?? 0) + 1);
    }
  }

  for (const c of list) {
    const claimed = countByCoupon.get(c.id) ?? 0;
    const mine = mineByCoupon.get(c.id) ?? null;
    const item: CouponWithState = {
      ...c,
      claimed_count: claimed,
      remaining: c.total_qty === null ? null : Math.max(0, c.total_qty - claimed),
      my_claim: mine
        ? {
            id: mine.id,
            code: mine.code,
            claimed_at: mine.claimed_at,
            used_at: mine.used_at,
            order_id: mine.order_id,
          }
        : null,
      my_claim_count: mineCountByCoupon.get(c.id) ?? 0,
    };
    const arr = map.get(c.activity_id) ?? [];
    arr.push(item);
    map.set(c.activity_id, arr);
  }
  return map;
}

/** 结算校验结果 */
export type CouponValidation =
  | {
      ok: true;
      coupon: CouponRow;
      claim: { id: string; code: string; user_id: string; used_at: string | null; order_id: string | null };
      discount: number;
      payable: number;
    }
  | { ok: false; status: number; error: string };

/**
 * 结账校验专属码（服务端权威）：码存在 → 属于本人 → 未使用 → 未被其它订单占用
 * → 券可用（启用/时间窗）→ 原价满足门槛 → 优惠后实付 > 0。
 * originalTotal 必须由调用方用服务端现价算好（绝不用客户端金额）。
 */
export async function validateCouponCode(
  db: ReturnType<typeof supabaseAdmin>,
  code: string,
  userId: string,
  originalTotal: number,
): Promise<CouponValidation> {
  const { data, error } = await db
    .from('coupon_claims')
    .select('id, coupon_id, user_id, code, used_at, order_id, coupons(*)')
    .eq('code', code)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };

  const row = data as
    | {
        id: string;
        coupon_id: string;
        user_id: string;
        code: string;
        used_at: string | null;
        order_id: string | null;
        coupons: CouponRow | CouponRow[] | null;
      }
    | null;
  if (!row) return { ok: false, status: 404, error: '优惠码不存在，请核对后再试' };
  if (row.user_id !== userId) return { ok: false, status: 403, error: '该优惠码不属于当前账号' };
  if (row.used_at) return { ok: false, status: 409, error: '该优惠码已使用' };
  if (row.order_id) return { ok: false, status: 409, error: '该优惠码已被另一笔订单占用' };

  const coupon = (Array.isArray(row.coupons) ? row.coupons[0] : row.coupons) as CouponRow | null;
  if (!coupon) return { ok: false, status: 404, error: '优惠券不存在' };
  if (!coupon.enabled) return { ok: false, status: 409, error: '该优惠券已停用' };
  const now = Date.now();
  if (coupon.valid_from && now < Date.parse(coupon.valid_from)) {
    return { ok: false, status: 409, error: '该优惠券还没到生效时间' };
  }
  if (coupon.valid_to && now > Date.parse(coupon.valid_to)) {
    return { ok: false, status: 409, error: '该优惠券已过期' };
  }
  if (originalTotal < Number(coupon.min_amount)) {
    return {
      ok: false,
      status: 409,
      error: `该券需满 ¥${Number(coupon.min_amount).toFixed(2)} 可用，当前订单金额不足`,
    };
  }

  const discount = computeDiscount(coupon, originalTotal);
  const payable = Math.round((originalTotal - discount) * 100) / 100;
  if (payable <= 0) {
    return { ok: false, status: 409, error: '使用该券后实付为 0，本单无法使用（请联系客服）' };
  }

  return {
    ok: true,
    coupon,
    claim: {
      id: row.id,
      code: row.code,
      user_id: row.user_id,
      used_at: row.used_at,
      order_id: row.order_id,
    },
    discount,
    payable,
  };
}

/**
 * 下单锁券（CAS）：仅当该券未被占用/未使用时写入 order_id。
 * 返回 false = 并发被抢先（调用方应回滚订单并提示）。
 */
export async function lockClaimForOrder(
  db: ReturnType<typeof supabaseAdmin>,
  claimId: string,
  orderId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('coupon_claims')
    .update({ order_id: orderId })
    .eq('id', claimId)
    .is('order_id', null)
    .is('used_at', null)
    .select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** 订单取消：释放占用的券（回到可用状态） */
export async function releaseClaimForOrder(
  db: ReturnType<typeof supabaseAdmin>,
  orderId: string,
): Promise<void> {
  const { error } = await db
    .from('coupon_claims')
    .update({ order_id: null })
    .eq('order_id', orderId)
    .is('used_at', null);
  if (error) throw new Error(error.message);
}

/** 订单确认收款：核销该单占用的券 */
export async function consumeClaimForOrder(
  db: ReturnType<typeof supabaseAdmin>,
  orderId: string,
): Promise<void> {
  const { error } = await db
    .from('coupon_claims')
    .update({ used_at: new Date().toISOString() })
    .eq('order_id', orderId)
    .is('used_at', null);
  if (error) throw new Error(error.message);
}

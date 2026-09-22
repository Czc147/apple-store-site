/**
 * 会员卡与 VIP 折扣（迁移 023）。
 * ⚠️ 仅供服务端（route handler / server component）import —— 依赖 coupons-server。
 *
 * 两条规则（用户 2026-09-22 拍板）：
 *   1. 卡等级：用户持多个订阅权益时取**最高档**，过期的不算。
 *   2. 折扣与优惠券**不叠加，取更优**——算出来哪个减得多用哪个。
 *
 * 折扣百分比口径与 coupons.value 完全一致（20 = 打 8 折），
 * 所以金额计算直接复用 computeDiscount()，没有再写第二套公式。
 */
import { COUPON_TYPE } from '@/lib/coupon-types';
import { computeDiscount } from '@/lib/coupons-server';
import type { supabaseAdmin } from '@/lib/supabase/admin';
import { ORDER_TYPE, type OrderType } from '@/lib/order-types';
import {
  CARD_STYLE,
  DISCOUNT_SCOPE,
  type CardStyle,
  type DiscountScope,
  type Subscription,
  type UserEntitlement,
} from '@/lib/types';
import type { Parsed } from '@/lib/card-redeem-fields';

/** 卡档位排序：黑金 > 金 > 银 */
export const CARD_RANK: Record<CardStyle, number> = {
  [CARD_STYLE.SILVER]: 1,
  [CARD_STYLE.GOLD]: 2,
  [CARD_STYLE.BLACK]: 3,
};

const CARD_STYLE_VALUES: CardStyle[] = Object.values(CARD_STYLE);
const DISCOUNT_SCOPE_VALUES: DiscountScope[] = Object.values(DISCOUNT_SCOPE);

// ---------------------------------------------------------------- 表单解析
// POST（新建）与 PUT（更新）共用，保证两处校验口径一致。

/** 解析会员卡样式；未提供 → null（不发卡），非法值返回错误文案 */
export function parseCardStyle(raw: unknown): Parsed<CardStyle> {
  if (raw === undefined) return { ok: true, value: null, specified: false };
  if (raw === null || raw === '') return { ok: true, value: null, specified: true };
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!CARD_STYLE_VALUES.includes(v as CardStyle)) {
    return { ok: false, error: '会员卡样式只能是银卡 / 金卡 / 黑金卡' };
  }
  return { ok: true, value: v as CardStyle, specified: true };
}

/** 解析折扣百分比（减掉的百分比）；未提供 / 空 → null，非法值返回错误文案 */
export function parseDiscountPercent(raw: unknown): Parsed<number> {
  if (raw === undefined) return { ok: true, value: null, specified: false };
  if (raw === null || raw === '') return { ok: true, value: null, specified: true };
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n >= 100) {
    return { ok: false, error: '折扣需在 0 到 100 之间（填 20 即打 8 折）' };
  }
  // 与 numeric(5,2) 对齐，避免存入后回显出现浮点尾巴
  return { ok: true, value: Math.round(n * 100) / 100, specified: true };
}

/** 解析折扣范围多选；空数组视同未设置 */
export function parseDiscountScope(raw: unknown): Parsed<DiscountScope[]> {
  if (raw === undefined) return { ok: true, value: null, specified: false };
  if (raw === null || raw === '') return { ok: true, value: null, specified: true };
  if (!Array.isArray(raw)) {
    return { ok: false, error: '折扣范围必须是数组' };
  }
  const out: DiscountScope[] = [];
  for (const item of raw) {
    const v = typeof item === 'string' ? item.trim() : '';
    if (!DISCOUNT_SCOPE_VALUES.includes(v as DiscountScope)) {
      return { ok: false, error: '折扣范围只能是「选购页商品」或「订阅套餐」' };
    }
    if (!out.includes(v as DiscountScope)) out.push(v as DiscountScope);
  }
  return { ok: true, value: out.length > 0 ? out : null, specified: true };
}

/** 解析时间窗端点；空串 → null（不限） */
export function parseDateTime(raw: unknown, label: string): Parsed<string> {
  if (raw === undefined) return { ok: true, value: null, specified: false };
  if (raw === null || raw === '') return { ok: true, value: null, specified: true };
  const v = typeof raw === 'string' ? raw.trim() : '';
  const t = Date.parse(v);
  if (!v || Number.isNaN(t)) {
    return { ok: false, error: `${label}不是合法时间` };
  }
  return { ok: true, value: new Date(t).toISOString(), specified: true };
}

// ---------------------------------------------------------------- 会员卡

export interface MemberCardInfo {
  subscriptionId: string;
  subscriptionName: string;
  style: CardStyle;
  /** 卡中心的大文本；后台没填就退回订阅名 */
  text: string;
  /** 该权益的到期时间；null = 永久 */
  expiresAt: string | null;
}

type CardEntitlement = Pick<
  UserEntitlement,
  'kind' | 'subscription_id' | 'expires_at'
>;
type CardSubscription = Pick<
  Subscription,
  'id' | 'name' | 'card_style' | 'card_text'
>;

/** 权益是否仍在有效期内（null = 永久） */
function entitlementAlive(expiresAt: string | null, now: Date): boolean {
  if (!expiresAt) return true;
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) ? true : t > now.getTime();
}

/**
 * 从用户的订阅权益里挑出要展示的那张卡。
 * 取最高档；同档取到期更晚的（永久最优先）。都不满足返回 null。
 */
export function pickMemberCard(
  entitlements: CardEntitlement[],
  subsById: Map<string, CardSubscription>,
  now: Date = new Date(),
): MemberCardInfo | null {
  let best: { info: MemberCardInfo; rank: number; expiresAt: number } | null =
    null;

  for (const e of entitlements) {
    if (e.kind !== 'subscription' || !e.subscription_id) continue;
    if (!entitlementAlive(e.expires_at, now)) continue;

    const sub = subsById.get(e.subscription_id);
    const style = sub?.card_style;
    if (!sub || !style || !CARD_STYLE_VALUES.includes(style)) continue;

    const rank = CARD_RANK[style];
    // 永久（null）视为最大，排在同档里优先
    const expiresAt = e.expires_at ? Date.parse(e.expires_at) : Infinity;
    const better =
      !best ||
      rank > best.rank ||
      (rank === best.rank && expiresAt > best.expiresAt);
    if (!better) continue;

    best = {
      rank,
      expiresAt,
      info: {
        subscriptionId: sub.id,
        subscriptionName: sub.name,
        style,
        text: sub.card_text?.trim() || sub.name,
        expiresAt: e.expires_at ?? null,
      },
    };
  }

  return best?.info ?? null;
}

// ---------------------------------------------------------------- 折扣

export interface ActiveDiscount {
  subscriptionId: string;
  percent: number;
  scope: DiscountScope[];
}

/** 该订阅此刻生效的折扣；不在窗口内、没配范围、没配比例都返回 null */
export function activeDiscount(
  sub: Pick<
    Subscription,
    | 'id'
    | 'discount_percent'
    | 'discount_scope'
    | 'discount_valid_from'
    | 'discount_valid_to'
  >,
  now: Date = new Date(),
): ActiveDiscount | null {
  const percent = Number(sub.discount_percent);
  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) return null;

  const scope = (sub.discount_scope ?? []).filter((s): s is DiscountScope =>
    DISCOUNT_SCOPE_VALUES.includes(s),
  );
  if (scope.length === 0) return null;

  const t = now.getTime();
  if (sub.discount_valid_from) {
    const from = Date.parse(sub.discount_valid_from);
    if (!Number.isNaN(from) && t < from) return null;
  }
  if (sub.discount_valid_to) {
    const to = Date.parse(sub.discount_valid_to);
    if (!Number.isNaN(to) && t > to) return null;
  }

  return { subscriptionId: sub.id, percent, scope };
}

/**
 * 订单类型 → 折扣范围。
 * 注意用的是**订单**类型（ORDER_TYPE：sub_unit / subscription），
 * 不是订阅产品的 type（SUBSCRIPTION_TYPE：normal / daily_plan），两者别混。
 */
export function orderTypeToScope(type: OrderType): DiscountScope {
  return type === ORDER_TYPE.SUBSCRIPTION
    ? DISCOUNT_SCOPE.SUBSCRIPTION
    : DISCOUNT_SCOPE.UNIT;
}

/** VIP 折扣金额。口径与 computeDiscount 完全一致，不另立公式 */
export function computeVipDiscount(
  percent: number,
  originalTotal: number,
): number {
  return computeDiscount(
    { type: COUPON_TYPE.PERCENT, value: percent },
    originalTotal,
  );
}

/**
 * 取该用户此刻适用于这种订单的 VIP 折扣，多个订阅都有折扣时取百分比最高的那个。
 * 只认**未过期**的订阅权益。任何一步失败都返回 null ——
 * 优惠是加分项，不能因为它让下单/试算失败。
 *
 * 下单（/api/orders）与试算（/api/coupons/validate）共用，保证两处口径一致。
 */
export async function loadApplicableDiscount(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string,
  orderType: OrderType,
): Promise<ActiveDiscount | null> {
  const nowIso = new Date().toISOString();

  const { data: ents, error } = await db
    .from('user_entitlements')
    .select('subscription_id')
    .eq('user_id', userId)
    .eq('kind', 'subscription')
    // 过期权益不参与；expires_at 为 null 表示永久
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);
  if (error || !ents?.length) return null;

  const ids = Array.from(
    new Set(
      ents
        .map((e) => e.subscription_id as string | null)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  );
  if (ids.length === 0) return null;

  const { data: subs, error: subErr } = await db
    .from('subscriptions')
    .select(
      'id, discount_percent, discount_scope, discount_valid_from, discount_valid_to',
    )
    .in('id', ids);
  if (subErr || !subs?.length) return null;

  const need = orderTypeToScope(orderType);
  const now = new Date();
  let best: ActiveDiscount | null = null;

  for (const sub of subs) {
    const d = activeDiscount(sub as Parameters<typeof activeDiscount>[0], now);
    if (!d || !d.scope.includes(need)) continue;
    if (!best || d.percent > best.percent) best = d;
  }
  return best;
}

export interface BestDiscount {
  amount: number;
  source: 'coupon' | 'vip' | null;
}

/**
 * 券与 VIP 折扣**不叠加，取更优**。
 * 金额相同时判给券（用户主动填了码，按他的预期走，也保证券会被核销）。
 */
export function resolveBestDiscount(args: {
  couponDisc: number;
  vipDisc: number;
}): BestDiscount {
  const coupon = Math.max(0, args.couponDisc);
  const vip = Math.max(0, args.vipDisc);

  if (coupon <= 0 && vip <= 0) return { amount: 0, source: null };
  if (vip > coupon) return { amount: vip, source: 'vip' };
  return { amount: coupon, source: 'coupon' };
}

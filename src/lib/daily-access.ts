/**
 * 每日计划解锁状态判定（仅服务端使用）。
 *
 * 两种凭证：
 * - 登录用户：user_entitlements 的 daily_plan 权益（权威记录）
 * - 游客：已核销的解锁码本身（card_keys.status='issued' 的
 *   unlock_daily 卡密；有效期服务端按 issued_at + unlock_duration_days 现算，
 *   绝不信客户端本地存的日期）
 */

import { supabaseAdmin } from './supabase/admin';
import { CARD_KEY_STATUS } from './card-types';

export interface DailyAccessStatus {
  unlocked: boolean;
  /** 永久有效 */
  permanent: boolean;
  /** 曾经解锁但已过期（前台可显示续费入口） */
  expired: boolean;
  expires_at: string | null;
  remaining_days: number | null;
}

export const DAILY_LOCKED: DailyAccessStatus = {
  unlocked: false,
  permanent: false,
  expired: false,
  expires_at: null,
  remaining_days: null,
};

const DAY_MS = 24 * 3600 * 1000;

/** 由「到期时刻（ms）」换算状态；null = 永久 */
export function expiryToStatus(expiresMs: number | null): DailyAccessStatus {
  if (expiresMs === null) {
    return {
      unlocked: true,
      permanent: true,
      expired: false,
      expires_at: null,
      remaining_days: null,
    };
  }
  const now = Date.now();
  if (expiresMs <= now) {
    return {
      unlocked: false,
      permanent: false,
      expired: true,
      expires_at: new Date(expiresMs).toISOString(),
      remaining_days: 0,
    };
  }
  return {
    unlocked: true,
    permanent: false,
    expired: false,
    expires_at: new Date(expiresMs).toISOString(),
    remaining_days: Math.ceil((expiresMs - now) / DAY_MS),
  };
}

/**
 * 登录用户：查每日计划权益。
 * 两条腿都算数（同用户可能同时持有）：
 * - kind='daily_plan'（旧：兑换码核销 / 同步）
 * - kind='subscription' 且指向 type='daily_plan' 的订阅（新：订单购买）
 * 取两者中「更晚到期」的一条；任一为永久则整体永久。
 */
export async function getDailyAccessByUserId(
  userId: string,
): Promise<DailyAccessStatus> {
  const db = supabaseAdmin();

  const { data: dailySub, error: dailySubErr } = await db
    .from('subscriptions')
    .select('id')
    .eq('type', 'daily_plan')
    .maybeSingle();
  if (dailySubErr) throw new Error(dailySubErr.message);
  const dailySubId = (dailySub as { id: string } | null)?.id ?? null;

  const { data, error } = await db
    .from('user_entitlements')
    .select('kind, subscription_id, expires_at')
    .eq('user_id', userId)
    .in('kind', ['daily_plan', 'subscription']);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    kind: string;
    subscription_id: string | null;
    expires_at: string | null;
  }>;
  const relevant = rows.filter(
    (r) => r.kind === 'daily_plan' || (dailySubId !== null && r.subscription_id === dailySubId),
  );
  if (relevant.length === 0) return DAILY_LOCKED;
  if (relevant.some((r) => r.expires_at === null)) return expiryToStatus(null);

  const latestMs = Math.max(...relevant.map((r) => Date.parse(r.expires_at as string)));
  return expiryToStatus(latestMs);
}

/** 游客：以已核销的解锁码为凭证（统一失败语义，调用方负责防枚举文案） */
export async function getDailyAccessByCode(
  code: string,
): Promise<DailyAccessStatus> {
  const db = supabaseAdmin();

  const { data: keys, error: keysErr } = await db
    .from('card_keys')
    .select('card_product_id, status, issued_at')
    .eq('content', code)
    .order('created_at', { ascending: true });
  if (keysErr) throw new Error(keysErr.message);

  // 必须是「已核销」的解锁码；未核销请先去兑换页兑换
  const issued = (keys ?? []).find(
    (k) => (k as { status: string }).status === CARD_KEY_STATUS.ISSUED,
  ) as { card_product_id: string; issued_at: string | null } | undefined;
  if (!issued || !issued.issued_at) return DAILY_LOCKED;

  const { data: product, error: productErr } = await db
    .from('card_products')
    .select('redeem_type, unlock_duration_days')
    .eq('id', issued.card_product_id)
    .maybeSingle();
  if (productErr) throw new Error(productErr.message);

  const p = product as {
    redeem_type: string | null;
    unlock_duration_days: number | null;
  } | null;
  if (!p || p.redeem_type !== 'unlock_daily') return DAILY_LOCKED;

  const duration =
    typeof p.unlock_duration_days === 'number' && p.unlock_duration_days > 0
      ? p.unlock_duration_days
      : null;
  const expiresMs =
    duration === null
      ? null
      : Date.parse(issued.issued_at) + duration * DAY_MS;
  return expiryToStatus(expiresMs);
}

/**
 * 一起买（拼单）· 服务端工具。
 * ⚠️ 仅供服务端 import（路由 / server component）。
 */
import type { supabaseAdmin } from '@/lib/supabase/admin';

export type GroupBuyStatus = 'open' | 'full' | 'closed' | 'expired';

export interface GroupBuyRow {
  id: string;
  initiator_id: string;
  sub_unit_id: string;
  target_count: number;
  status: GroupBuyStatus;
  expires_at: string;
  created_at: string;
  closed_at: string | null;
}

export interface GroupBuyMemberRow {
  id: string;
  group_buy_id: string;
  user_id: string;
  joined_at: string;
  order_id: string | null;
}

/** 默认有效期：24 小时（到期自动关闭，见迁移 029） */
export const DEFAULT_TTL_HOURS = 24;

/**
 * 每人应付 = 原价 ÷ 成团人数。
 *
 * **不落库**：它是从 sub_units.price 与 target_count 现算的派生值，
 * 存下来就有两个真相，改价或改人数时必然对不上。
 * 保留两位小数（与订单金额口径一致），且不会低于 0。
 */
export function perPersonPrice(unitPrice: number, targetCount: number): number {
  if (!Number.isFinite(unitPrice) || targetCount <= 0) return 0;
  const n = Math.round((unitPrice / targetCount) * 100) / 100;
  return Math.max(0, n);
}

/**
 * 把已经过期的「进行中」团标记为 expired。
 *
 * 本项目没有 cron（与 community 的 7 天清理同一套降级手法）：读取时顺手判一下，
 * 不需要常驻进程。用户拍板的就是「到期自动关闭」，所以这里必须标，
 * 否则过期的团会一直挂在列表里骗人点进来。
 *
 * 只影响 status='open' 的：已满员的团即使过了期限也要保留（大家在推单/付款）。
 */
export async function expireStale(
  db: ReturnType<typeof supabaseAdmin>,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await db
    .from('group_buys')
    .update({ status: 'expired', closed_at: nowIso })
    .eq('status', 'open')
    .lt('expires_at', nowIso);
}

/**
 * 按当前成员数校正状态：满员则置 full，并从 full 退回 open（有人退出时）。
 * 只在 open/full 之间来回，不碰 closed/expired。
 */
export async function syncStatus(
  db: ReturnType<typeof supabaseAdmin>,
  groupBuyId: string,
): Promise<void> {
  const { data: gb } = await db
    .from('group_buys')
    .select('status, target_count')
    .eq('id', groupBuyId)
    .maybeSingle();
  if (!gb) return;
  const status = gb.status as GroupBuyStatus;
  if (status !== 'open' && status !== 'full') return;

  const { count } = await db
    .from('group_buy_members')
    .select('id', { count: 'exact', head: true })
    .eq('group_buy_id', groupBuyId);

  const full = (count ?? 0) >= (gb.target_count as number);
  const next: GroupBuyStatus = full ? 'full' : 'open';
  if (next === status) return;

  await db
    .from('group_buys')
    .update({ status: next, closed_at: full ? new Date().toISOString() : null })
    .eq('id', groupBuyId);
}

/**
 * 批量取小单元（列表要显示名称与价格）。
 *
 * ⚠️ **不要选 cover_url** —— `sub_units` 根本没有这一列（真实列见迁移 001：
 * id/major_unit_id/name/sort_order/price/payment_url/created_at/redeem_image_url，
 * 其中 redeem_image_url 是**私密的兑换内容**，不能当公开封面用）。
 * 之前这里误选了 cover_url，整个 select 直接报错、返回空集，
 * 表现成列表里价格全是 ¥0、商品名显示"（该单元已下架）"（实测踩过）。
 * 小单元没有公开封面是数据模型本身的事实，如实返回 null 即可。
 */
export async function loadSubUnits(
  db: ReturnType<typeof supabaseAdmin>,
  ids: string[],
): Promise<
  Map<string, { id: string; name: string; price: string; cover_url: string | null }>
> {
  const map = new Map<
    string,
    { id: string; name: string; price: string; cover_url: string | null }
  >();
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (uniq.length === 0) return map;

  const { data, error } = await db
    .from('sub_units')
    .select('id, name, price')
    .in('id', uniq);
  if (error) {
    // 取数失败时别静默返回空 map：上层会显示成"已下架 / ¥0"，比报错更难查
    console.warn('[group-buy] 小单元取数失败：', error.message);
  }
  for (const s of data ?? []) {
    map.set(s.id as string, {
      id: s.id as string,
      name: s.name as string,
      price: String(s.price),
      cover_url: null,
    });
  }
  return map;
}

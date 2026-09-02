import { supabaseAdmin } from '@/lib/supabase/admin';
import type { CardKeyStats } from '@/lib/card-types';

/**
 * PostgREST 单次请求最多返回 1000 行（Supabase 默认 db-max-rows）。
 * 早期版本直接 `select('card_product_id, status')` 全表抓回再 JS 聚合，
 * 卡密超过 1000 条时被静默截断 → 概览/商品页统计小于库存页真实数量。
 * 本助手按 id 顺序分块抓取全部「状态行」再聚合，结果与 count('exact') 一致。
 */
const ROW_CHUNK = 1000;

export const EMPTY_KEY_STATS: CardKeyStats = { total: 0, unused: 0, issued: 0, void: 0 };

function bump(stats: CardKeyStats, status: string) {
  stats.total += 1;
  if (status === 'unused') stats.unused += 1;
  else if (status === 'issued') stats.issued += 1;
  else if (status === 'void') stats.void += 1;
}

/**
 * 精确聚合卡密库存统计（总量 + 按商品分组）。
 * @param productId 提供时仅聚合该商品（byProduct 中至多一项）
 * @throws Error 数据库错误（调用方转 500）
 */
export async function aggregateKeyStats(productId?: string): Promise<{
  total: CardKeyStats;
  byProduct: Record<string, CardKeyStats>;
}> {
  const total: CardKeyStats = { ...EMPTY_KEY_STATS };
  const byProduct: Record<string, CardKeyStats> = {};

  let from = 0;
  for (;;) {
    let query = supabaseAdmin()
      .from('card_keys')
      .select('card_product_id, status')
      .order('id', { ascending: true })
      .range(from, from + ROW_CHUNK - 1);
    if (productId) query = query.eq('card_product_id', productId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{ card_product_id: string; status: string }>;
    for (const row of rows) {
      bump(total, row.status);
      bump((byProduct[row.card_product_id] ??= { ...EMPTY_KEY_STATS }), row.status);
    }

    if (rows.length < ROW_CHUNK) break;
    from += ROW_CHUNK;
  }

  return { total, byProduct };
}

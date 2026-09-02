import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { type CardProduct } from '@/lib/card-types';
import { resolveTargetNames } from '@/lib/card-targets';
import { aggregateKeyStats, EMPTY_KEY_STATS } from '@/lib/card-stats';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/**
 * GET /api/card-management/stats — 卡密库存统计（需登录）
 *
 * - ?card_product_id=xxx → 单商品：
 *     { card_product_id, total, unused, issued, void }（商品不存在 404）
 * - 不带参数 → 全局：
 *     { total: {…}, by_product: [{ card_product_id, description, target_name, total, unused, issued, void }] }
 */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const productId = req.nextUrl.searchParams.get('card_product_id')?.trim() || null;
  const db = supabaseAdmin();

  // 指定商品时先校验存在性，给出 404 而不是空统计
  if (productId) {
    const { data: product, error: productErr } = await db
      .from('card_products')
      .select('id')
      .eq('id', productId)
      .maybeSingle();
    if (productErr) return fail(productErr.message, 500);
    if (!product) return fail('卡密商品不存在', 404);
  }

  // 分块抓取状态行再聚合（PostgREST 单请求上限 1000 行，见 lib/card-stats.ts）
  let agg: Awaited<ReturnType<typeof aggregateKeyStats>>;
  try {
    agg = await aggregateKeyStats(productId ?? undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : '统计失败', 500);
  }

  // 单商品模式
  if (productId) {
    return ok({
      card_product_id: productId,
      ...(agg.byProduct[productId] ?? { ...EMPTY_KEY_STATS }),
    });
  }

  // 全局模式：附带商品描述与关联目标名称，便于后台仪表盘直接渲染
  const { data: products, error: productsErr } = await db
    .from('card_products')
    .select('id, description, target_type, target_id, sort_order')
    .order('sort_order', { ascending: true });
  if (productsErr) return fail(productsErr.message, 500);

  const names = await resolveTargetNames(
    (products ?? []) as Array<Pick<CardProduct, 'id' | 'target_type' | 'target_id'>>,
  );

  const byProduct = ((products ?? []) as Array<{
    id: string;
    description: string | null;
  }>).map((p) => ({
    card_product_id: p.id,
    description: p.description ?? null,
    target_name: names.get(p.id)?.target_name ?? null,
    ...(agg.byProduct[p.id] ?? { ...EMPTY_KEY_STATS }),
  }));

  return ok({ total: agg.total, by_product: byProduct });
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody, toNullableText, toSortOrder } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import {
  TARGET_TYPE_VALUES,
  type CardTargetType,
  type CardProduct,
  type CardKeyStats,
} from '@/lib/card-types';
import { resolveTargetNames, targetExists } from '@/lib/card-targets';
import { aggregateKeyStats } from '@/lib/card-stats';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** GET /api/card-management/products/:id — 单条 + 库存统计 + 关联名称 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const db = supabaseAdmin();

  const { data, error } = await db
    .from('card_products')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('卡密商品不存在', 404);
  const product = data as CardProduct;

  // 该商品的库存统计（分块聚合，PostgREST 单请求上限 1000 行，见 lib/card-stats.ts）
  let stats: CardKeyStats;
  try {
    stats = (await aggregateKeyStats(params.id)).total;
  } catch (e) {
    return fail(e instanceof Error ? e.message : '统计失败', 500);
  }

  // 关联目标名称（目标被删除后为 null，前端显示「关联对象已删除」）
  const names = await resolveTargetNames([product]);
  const info = names.get(product.id);

  return ok({
    ...product,
    stats,
    target_name: info?.target_name ?? null,
    group_name: info?.group_name ?? null,
  });
}

/**
 * PUT /api/card-management/products/:id — 局部更新（需登录）
 * 可更新字段：
 * - target_type + target_id（成对提供）  校验存在性 + 「一个目标一个卡密商品」唯一性（409）
 * - description（string）   空串归一为 null
 * - enabled（boolean）      启用/禁用
 * - sort_order（number）    非数字归一为 0
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');
  const db = supabaseAdmin();
  const patch: Record<string, unknown> = {};

  const hasType = body.target_type !== undefined;
  const hasId = body.target_id !== undefined;
  if (hasType || hasId) {
    if (!hasType || !hasId) return fail('target_type 与 target_id 需同时提供');
    const targetType = typeof body.target_type === 'string' ? body.target_type.trim() : '';
    const targetId = typeof body.target_id === 'string' ? body.target_id.trim() : '';
    if (!TARGET_TYPE_VALUES.includes(targetType as CardTargetType)) {
      return fail('target_type 必须为 sub_unit / activity / subscription');
    }
    if (!targetId) return fail('target_id 不能为空');

    const type = targetType as CardTargetType;
    const typeLabel =
      type === 'sub_unit' ? '小单元' : type === 'activity' ? '活动' : '订阅';

    if (!(await targetExists(type, targetId))) {
      return fail(`关联的${typeLabel}不存在`);
    }

    // 目标不能已关联其它卡密商品（排除自身）
    const { data: linked, error: linkedErr } = await db
      .from('card_products')
      .select('id')
      .eq('target_type', type)
      .eq('target_id', targetId)
      .neq('id', params.id)
      .maybeSingle();
    if (linkedErr) return fail(linkedErr.message, 500);
    if (linked) return fail(`该${typeLabel}已关联其它卡密商品`, 409);

    patch.target_type = type;
    patch.target_id = targetId;
  }
  if (body.description !== undefined) patch.description = toNullableText(body.description);
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (body.sort_order !== undefined) patch.sort_order = toSortOrder(body.sort_order);

  if (Object.keys(patch).length === 0) return fail('没有可更新的字段');

  const { data, error } = await db
    .from('card_products')
    .update(patch)
    .eq('id', params.id)
    .select()
    .maybeSingle();
  if (error) {
    if (error.code === '23505') return fail('该目标已关联其它卡密商品', 409);
    return fail(error.message, 500);
  }
  if (!data) return fail('卡密商品不存在', 404);
  return ok(data);
}

/**
 * DELETE /api/card-management/products/:id — 删除（需登录）
 * 默认：商品下存在任何卡密或取卡登记时禁止删除（409）。
 * 附加 ?cascade_keys=1：先清空该商品下「未使用 / 已作废」卡密再删除商品，
 *   用于清理误导入；但只要存在已发放卡密或取卡登记，仍然禁止删除（409）。
 * 不再使用的商品也可改为禁用（enabled = false）。
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const db = supabaseAdmin();

  const cascade = req.nextUrl.searchParams.get('cascade_keys') === '1';

  const { data: product, error: findErr } = await db
    .from('card_products')
    .select('id')
    .eq('id', params.id)
    .maybeSingle();
  if (findErr) return fail(findErr.message, 500);
  if (!product) return fail('卡密商品不存在', 404);

  // 外键为 RESTRICT：先行检查以返回友好提示（而不是数据库原始错误）
  const [keysRes, issuedRes, deliveriesRes] = await Promise.all([
    db
      .from('card_keys')
      .select('id', { count: 'exact', head: true })
      .eq('card_product_id', params.id),
    db
      .from('card_keys')
      .select('id', { count: 'exact', head: true })
      .eq('card_product_id', params.id)
      .eq('status', 'issued'),
    db
      .from('card_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('card_product_id', params.id),
  ]);
  const anyErr = keysRes.error ?? issuedRes.error ?? deliveriesRes.error;
  if (anyErr) return fail(anyErr.message, 500);

  const totalKeys = keysRes.count ?? 0;
  const issuedKeys = issuedRes.count ?? 0;
  const totalDeliveries = deliveriesRes.count ?? 0;

  // 资产保护：已发放卡密 / 取卡登记永远不可删（即使带了 cascade）
  if (issuedKeys > 0 || totalDeliveries > 0) {
    const parts: string[] = [];
    if (issuedKeys > 0) parts.push(`${issuedKeys} 张已发放卡密`);
    if (totalDeliveries > 0) parts.push(`${totalDeliveries} 条取卡登记`);
    return fail(
      `该商品下仍有 ${parts.join('、')}，禁止删除（批量清空只处理未使用 / 已作废卡密）；如不再使用请改为禁用`,
      409,
    );
  }

  // 还有卡密（此时必为未使用/已作废）：需显式 cascade 才一并清理
  if (totalKeys > 0 && !cascade) {
    return fail(
      `该商品下仍有 ${totalKeys} 张卡密，禁止删除；如需一并清空请勾选连带删除，或改为禁用`,
      409,
    );
  }

  if (totalKeys > 0) {
    const { error: clearErr } = await db
      .from('card_keys')
      .delete()
      .eq('card_product_id', params.id)
      .in('status', ['unused', 'void']);
    if (clearErr) return fail(clearErr.message, 500);
  }

  const { error } = await db.from('card_products').delete().eq('id', params.id);
  if (error) return fail(error.message, 500);
  return ok({ success: true, id: params.id, deleted_keys: totalKeys });
}

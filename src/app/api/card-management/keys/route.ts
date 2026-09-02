import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { CARD_KEY_STATUS, type CardKey, type CardKeyStatus, type CardProduct } from '@/lib/card-types';
import { resolveTargetNames } from '@/lib/card-targets';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const VALID_STATUS: CardKeyStatus[] = [
  CARD_KEY_STATUS.UNUSED,
  CARD_KEY_STATUS.ISSUED,
  CARD_KEY_STATUS.VOID,
];

/** 分页参数解析：page ≥ 1；page_size 1–100（默认 20） */
function parsePagination(search: URLSearchParams) {
  const page = Math.max(1, Number.parseInt(search.get('page') ?? '1', 10) || 1);
  const rawSize = Number.parseInt(search.get('page_size') ?? '20', 10);
  const pageSize = Number.isFinite(rawSize) ? Math.min(100, Math.max(1, rawSize)) : 20;
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

/** 日期参数归一化：仅日期（YYYY-MM-DD）时，起点补 00:00、终点补 23:59:59.999 */
function normalizeDateParam(value: string | null, endOfDay: boolean): string | null {
  if (!value || !value.trim()) return null;
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return endOfDay ? `${s}T23:59:59.999Z` : `${s}T00:00:00.000Z`;
  }
  return s;
}

/**
 * GET /api/card-management/keys — 卡密列表（需登录，按导入时间倒序）
 * 筛选参数：
 * - card_product_id   按卡密商品过滤
 * - status            unused / issued / void
 * - order_id          精确匹配订单号
 * - issued_from / issued_to  发放时间范围（支持 YYYY-MM-DD 或完整时间）
 * 分页参数：page（默认 1）、page_size（默认 20，上限 100）
 * 响应：{ items, total, page, page_size }；条目附带 description / target_name
 */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const search = req.nextUrl.searchParams;
  const productId = search.get('card_product_id')?.trim() || null;
  const status = search.get('status')?.trim() || null;
  const orderId = search.get('order_id')?.trim() || null;
  const issuedFrom = normalizeDateParam(search.get('issued_from'), false);
  const issuedTo = normalizeDateParam(search.get('issued_to'), true);

  if (status && !VALID_STATUS.includes(status as CardKeyStatus)) {
    return fail('status 必须为 unused / issued / void 之一');
  }

  const { page, pageSize, from, to } = parsePagination(search);

  let query = supabaseAdmin().from('card_keys').select('*', { count: 'exact' });
  if (productId) query = query.eq('card_product_id', productId);
  if (status) query = query.eq('status', status);
  if (orderId) query = query.eq('order_id', orderId);
  if (issuedFrom) query = query.gte('issued_at', issuedFrom);
  if (issuedTo) query = query.lte('issued_at', issuedTo);
  query = query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) return fail(error.message, 500);
  const items = (data ?? []) as CardKey[];

  // 附加商品描述与关联目标名称（只查本页涉及的卡密商品）
  const infoById: Record<
    string,
    { description: string | null; target_name: string | null }
  > = {};
  const productIds = [...new Set(items.map((i) => i.card_product_id))];
  if (productIds.length > 0) {
    const db = supabaseAdmin();
    const { data: products, error: productsErr } = await db
      .from('card_products')
      .select('id, description, target_type, target_id')
      .in('id', productIds);
    if (productsErr) return fail(productsErr.message, 500);

    const names = await resolveTargetNames(
      (products ?? []) as Array<Pick<CardProduct, 'id' | 'target_type' | 'target_id'>>,
    );
    for (const p of (products ?? []) as Array<{ id: string; description: string | null }>) {
      infoById[p.id] = {
        description: p.description ?? null,
        target_name: names.get(p.id)?.target_name ?? null,
      };
    }
  }

  return ok({
    items: items.map((i) => ({
      ...i,
      description: infoById[i.card_product_id]?.description ?? null,
      target_name: infoById[i.card_product_id]?.target_name ?? null,
    })),
    total: count ?? 0,
    page,
    page_size: pageSize,
  });
}

/**
 * DELETE /api/card-management/keys?card_product_id=xxx — 批量清空（需登录）
 * 仅删除该商品下「未使用 / 已作废」状态的卡密（已发放的绝不动），
 * 用于快速清理误导入的卡密。响应：{ deleted }
 */
export async function DELETE(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const productId = req.nextUrl.searchParams.get('card_product_id')?.trim();
  if (!productId) return fail('缺少 card_product_id 参数');

  const db = supabaseAdmin();

  // 商品必须存在，避免拿任意 id 误删
  const { data: product, error: productErr } = await db
    .from('card_products')
    .select('id')
    .eq('id', productId)
    .maybeSingle();
  if (productErr) return fail(productErr.message, 500);
  if (!product) return fail('卡密商品不存在', 404);

  const { data, error } = await db
    .from('card_keys')
    .delete()
    .eq('card_product_id', productId)
    .in('status', [CARD_KEY_STATUS.UNUSED, CARD_KEY_STATUS.VOID])
    .select('id');
  if (error) return fail(error.message, 500);

  return ok({ deleted: data?.length ?? 0 });
}

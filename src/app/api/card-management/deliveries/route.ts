import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import {
  CARD_DELIVERY_STATUS,
  type CardDelivery,
  type CardDeliveryStatus,
  type CardProduct,
} from '@/lib/card-types';
import { resolveTargetNames } from '@/lib/card-targets';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 取卡码长度：16 字节随机 → 32 位 hex（128 bit，防枚举） */
const CLAIM_TOKEN_BYTES = 16;
/** 订单号最大长度 */
const ORDER_ID_MAX = 100;

const VALID_STATUS: CardDeliveryStatus[] = [
  CARD_DELIVERY_STATUS.PENDING,
  CARD_DELIVERY_STATUS.FULFILLED,
  CARD_DELIVERY_STATUS.CANCELLED,
];

/** 分页参数解析：page ≥ 1；page_size 1–100（默认 20） */
function parsePagination(search: URLSearchParams) {
  const page = Math.max(1, Number.parseInt(search.get('page') ?? '1', 10) || 1);
  const rawSize = Number.parseInt(search.get('page_size') ?? '20', 10);
  const pageSize = Number.isFinite(rawSize) ? Math.min(100, Math.max(1, rawSize)) : 20;
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

/**
 * POST /api/card-management/deliveries — 登记取卡单（需登录）
 *
 * 业务场景：管理员在支付平台核实买家付款后，录入订单号 + 卡密商品 + 数量，
 * 系统生成取卡码（claim_token）；管理员把「订单号 + 取卡码」发给买家，
 * 买家通过 POST /api/card-management/deliver 自助取卡。
 * （若支付平台支持异步回调，将来可加签名校验的回调路由自动登记，表结构不变。）
 *
 * 请求体：{ order_id*, card_product_id*, quantity?（1–100，默认 1） }
 * 校验：商品存在且启用；订单号全局唯一（幂等键）；数量范围。
 * 库存不足不硬拦截（允许先登记后补货），响应返回 available 提示当前剩余。
 *
 * 响应 201：{ id, order_id, card_product_id, quantity, claim_token, status,
 *            available, created_at }
 */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  const orderId = typeof body?.order_id === 'string' ? body.order_id.trim() : '';
  const cardProductId =
    typeof body?.card_product_id === 'string' ? body.card_product_id.trim() : '';

  if (!orderId) return fail('order_id 为必填字段');
  if (orderId.length > ORDER_ID_MAX) return fail(`order_id 长度不能超过 ${ORDER_ID_MAX}`);
  if (!cardProductId) return fail('card_product_id 为必填字段');

  // 数量归一化：缺省 1；显式传入必须为 1–100 的整数
  let quantity = 1;
  if (body?.quantity !== undefined) {
    if (
      typeof body.quantity !== 'number' ||
      !Number.isInteger(body.quantity) ||
      body.quantity < 1 ||
      body.quantity > 100
    ) {
      return fail('quantity 必须为 1–100 的整数');
    }
    quantity = body.quantity;
  }

  const db = supabaseAdmin();

  // 商品必须存在且启用（禁用商品不允许登记取卡）
  const { data: product, error: productErr } = await db
    .from('card_products')
    .select('id, enabled')
    .eq('id', cardProductId)
    .maybeSingle();
  if (productErr) return fail(productErr.message, 500);
  if (!product) return fail('卡密商品不存在', 404);
  if (!(product as { enabled: boolean }).enabled) {
    return fail('卡密商品已禁用，不能登记取卡', 409);
  }

  // 订单号唯一（数据库 unique 约束兜底，先行给出友好提示）
  const { data: existing, error: existingErr } = await db
    .from('card_deliveries')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle();
  if (existingErr) return fail(existingErr.message, 500);
  if (existing) return fail('订单号已登记，同一订单号不能重复登记', 409);

  // 当前剩余库存（不硬拦截，仅作提示）
  const { count: available, error: countErr } = await db
    .from('card_keys')
    .select('id', { count: 'exact', head: true })
    .eq('card_product_id', cardProductId)
    .eq('status', 'unused');
  if (countErr) return fail(countErr.message, 500);

  // 取卡码：服务端生成的 128 bit 随机数（32 位 hex）
  const claimToken = randomBytes(CLAIM_TOKEN_BYTES).toString('hex');

  const { data, error } = await db
    .from('card_deliveries')
    .insert({
      order_id: orderId,
      card_product_id: cardProductId,
      quantity,
      claim_token: claimToken,
    })
    .select()
    .single();
  if (error) {
    // 并发重复登记的兜底（唯一约束冲突）
    if ((error as { code?: string }).code === '23505') {
      return fail('订单号已登记，同一订单号不能重复登记', 409);
    }
    return fail(error.message, 500);
  }

  return ok({ ...(data as CardDelivery), available: available ?? 0 }, 201);
}

/**
 * GET /api/card-management/deliveries — 取卡登记列表（需登录，按登记时间倒序）
 * 筛选参数：
 * - order_id          精确匹配
 * - card_product_id   按商品过滤
 * - status            pending / fulfilled / cancelled
 * - from / to         登记时间范围（created_at，支持 YYYY-MM-DD 或完整时间）
 * 分页参数：page / page_size
 * 响应条目附带 description / target_name；claim_token 完整返回（后台复制用）
 */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const search = req.nextUrl.searchParams;
  const orderId = search.get('order_id')?.trim() || null;
  const productId = search.get('card_product_id')?.trim() || null;
  const status = search.get('status')?.trim() || null;
  const from = search.get('from')?.trim() || null;
  const to = search.get('to')?.trim() || null;

  if (status && !VALID_STATUS.includes(status as CardDeliveryStatus)) {
    return fail('status 必须为 pending / fulfilled / cancelled 之一');
  }

  const { page, pageSize, from: rangeFrom, to: rangeTo } = parsePagination(search);

  let query = supabaseAdmin().from('card_deliveries').select('*', { count: 'exact' });
  if (orderId) query = query.eq('order_id', orderId);
  if (productId) query = query.eq('card_product_id', productId);
  if (status) query = query.eq('status', status);
  if (from) query = query.gte('created_at', /^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00.000Z` : from);
  if (to) query = query.lte('created_at', /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to);
  query = query.order('created_at', { ascending: false }).range(rangeFrom, rangeTo);

  const { data, error, count } = await query;
  if (error) return fail(error.message, 500);
  const items = (data ?? []) as CardDelivery[];

  // 附加商品描述与关联目标名称（只查本页涉及的商品）
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

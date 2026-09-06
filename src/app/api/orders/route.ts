import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  ORDER_TYPE,
  ORDER_STATUS,
  PAYMENT_METHOD,
  type OrderType,
  type PaymentMethod,
  type OrderStatus,
  type OrderCreateItem,
  type Order,
  type OrderItem,
} from '@/lib/order-types';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const VALID_REF_TYPES: OrderType[] = [ORDER_TYPE.SUB_UNIT, ORDER_TYPE.SUBSCRIPTION];
const VALID_PAYMENT: PaymentMethod[] = [PAYMENT_METHOD.WECHAT, PAYMENT_METHOD.ALIPAY];
const MAX_ITEMS = 20;

/** 生成可读订单号：Z + 年月日时分秒 + 2 字节随机 hex（唯一冲突时重试） */
function genOrderNo(): string {
  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const ts =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `Z${ts}${randomBytes(2).toString('hex').toUpperCase()}`;
}

/** 单个商品目标行（服务端重新落库，绝不信任客户端传的金额/名称） */
interface TargetRow {
  name: string;
  price: string;
}

/**
 * POST /api/orders — 推送订单（登录用户，Bearer 鉴权）
 *
 * 业务闭环：前台结算弹窗选微信/支付宝 → 「推送订单」→ 本站建 order + order_items，
 * 并按行创建 card_deliveries（幂等键 order_id = "order_no:line_index"）供确认时派发。
 *
 * 请求体：{ items: [{ ref_type, ref_id, quantity }], payment_method }
 * 校验：ref_type ∈ sub_unit|subscription；目标存在且有启用卡密商品；quantity 1–100。
 * 金额/名称由服务端按目标表现算（防篡改）。
 * 库存不足不硬拦截（允许先建单后补货，确认环节再校验）。
 *
 * 响应 201：{ order_no, total, type, payment_method }
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);
  if (!rateLimit('orders-create', getClientIp(req), 20, 60_000)) {
    return fail('操作过于频繁，请稍后再试', 429);
  }

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');

  const paymentMethod = body.payment_method as PaymentMethod;
  if (!VALID_PAYMENT.includes(paymentMethod)) {
    return fail('payment_method 必须为 wechat / alipay');
  }

  const rawItems: unknown[] = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) return fail('订单没有商品');
  if (rawItems.length > MAX_ITEMS) return fail(`一次最多下单 ${MAX_ITEMS} 个商品`);

  // 逐条解析 + 校验（订单类型必须一致：愿望单=sub_unit，订阅=subscription）
  const items: OrderCreateItem[] = [];
  let orderType: OrderType | null = null;
  for (const raw of rawItems) {
    const it = (raw ?? {}) as Record<string, unknown>;
    const refType = it.ref_type as OrderType;
    const refId = typeof it.ref_id === 'string' ? it.ref_id.trim() : '';
    const quantity = it.quantity;
    if (!VALID_REF_TYPES.includes(refType)) {
      return fail('ref_type 必须为 sub_unit / subscription');
    }
    if (!refId) return fail('ref_id 为必填字段');
    if (
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 100
    ) {
      return fail('quantity 必须为 1–100 的整数');
    }
    if (orderType && orderType !== refType) {
      return fail('同一订单只能包含同类商品（小单元或订阅）');
    }
    orderType = refType;
    items.push({ ref_type: refType, ref_id: refId, quantity });
  }

  const db = supabaseAdmin();

  // 解析每个目标：存在性 + 名称 + 金额（服务端现值） + 启用卡密商品
  const resolved: Array<{
    ref_type: OrderType;
    ref_id: string;
    quantity: number;
    name: string;
    price: string;
    card_product_id: string;
  }> = [];

  for (const item of items) {
    const target = await resolveTarget(db, item);
    if (!target) {
      return fail(
        item.ref_type === ORDER_TYPE.SUB_UNIT ? '商品不存在或已下架' : '订阅不存在或已下架',
        409,
      );
    }
    resolved.push({
      ...item,
      ...target,
    });
  }

  const total = resolved
    .reduce((sum, r) => sum + Number(r.price) * r.quantity, 0)
    .toFixed(2);

  // 建单：order 头 + order_items 行 + 每行一条 card_deliveries（幂等键）
  const orderNo = genOrderNo();
  const { data: order, error: orderErr } = await db
    .from('orders')
    .insert({
      order_no: orderNo,
      user_id: user.id,
      user_email: user.email,
      total,
      type: orderType,
      payment_method: paymentMethod,
      status: 'pending',
    })
    .select()
    .single();
  if (orderErr) return fail(orderErr.message, 500);

  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i];
    const deliveryOrderId = `${orderNo}:${i}`;
    const claimToken = randomBytes(16).toString('hex');

    const { error: itemErr } = await db.from('order_items').insert({
      order_id: (order as { id: string }).id,
      line_index: i,
      line_type: r.ref_type,
      ref_id: r.ref_id,
      name: r.name,
      price: r.price,
      quantity: r.quantity,
      card_product_id: r.card_product_id,
    });
    if (itemErr) return fail(itemErr.message, 500);

    const { error: delErr } = await db.from('card_deliveries').insert({
      order_id: deliveryOrderId,
      card_product_id: r.card_product_id,
      quantity: r.quantity,
      claim_token: claimToken,
    });
    if (delErr) return fail(delErr.message, 500);
  }

  return ok(
    {
      order_no: orderNo,
      total: Number(total),
      type: orderType,
      payment_method: paymentMethod,
    },
    201,
  );
}

/** 解析目标：存在性 + 名称 + 金额 + 启用卡密商品；目标缺失返回 null */
async function resolveTarget(
  db: ReturnType<typeof supabaseAdmin>,
  item: OrderCreateItem,
): Promise<{ name: string; price: string; card_product_id: string } | null> {
  const table = item.ref_type === ORDER_TYPE.SUB_UNIT ? 'sub_units' : 'subscriptions';
  const { data: target, error } = await db
    .from(table)
    .select('name, price')
    .eq('id', item.ref_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!target) return null;

  // 目标上必须挂了一个「启用」的卡密商品（确认时靠它派发）
  const { data: prod, error: prodErr } = await db
    .from('card_products')
    .select('id')
    .eq('target_type', item.ref_type)
    .eq('target_id', item.ref_id)
    .eq('enabled', true)
    .maybeSingle();
  if (prodErr) throw new Error(prodErr.message);
  if (!prod) return null;

  return {
    name: (target as { name: string }).name,
    price: String((target as { price: string }).price),
    card_product_id: (prod as { id: string }).id,
  };
}

const VALID_TYPES: OrderType[] = Object.values(ORDER_TYPE);
const VALID_STATUS: OrderStatus[] = Object.values(ORDER_STATUS);

/** 分页参数解析：page ≥ 1；page_size 1–100（默认 20） */
function parsePagination(search: URLSearchParams) {
  const page = Math.max(1, Number.parseInt(search.get('page') ?? '1', 10) || 1);
  const rawSize = Number.parseInt(search.get('page_size') ?? '20', 10);
  const pageSize = Number.isFinite(rawSize) ? Math.min(100, Math.max(1, rawSize)) : 20;
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

/**
 * GET /api/orders — 订单列表（管理员，按创建时间倒序）
 * 筛选：?type=sub_unit|subscription ；?status=pending|paid|canceled ；分页 page / page_size
 * 每单附带行项（按 line_index 排序）。
 */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const search = req.nextUrl.searchParams;
  const type = search.get('type')?.trim() || null;
  const status = search.get('status')?.trim() || null;
  if (type && !VALID_TYPES.includes(type as OrderType)) {
    return fail('type 必须为 sub_unit / subscription');
  }
  if (status && !VALID_STATUS.includes(status as OrderStatus)) {
    return fail('status 必须为 pending / paid / canceled');
  }

  const { page, pageSize, from, to } = parsePagination(search);
  const db = supabaseAdmin();

  let query = db.from('orders').select('*', { count: 'exact' });
  if (type) query = query.eq('type', type);
  if (status) query = query.eq('status', status);
  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) return fail(error.message, 500);
  const orders = (data ?? []) as Order[];
  const orderIds = orders.map((o) => o.id);

  // 一次拉取本页所有订单的行项，按 order_id 分组
  const itemsByOrder = new Map<string, OrderItem[]>();
  if (orderIds.length > 0) {
    const { data: items, error: itemsErr } = await db
      .from('order_items')
      .select('*')
      .in('order_id', orderIds)
      .order('line_index', { ascending: true });
    if (itemsErr) return fail(itemsErr.message, 500);
    for (const it of (items ?? []) as OrderItem[]) {
      const arr = itemsByOrder.get(it.order_id) ?? [];
      arr.push(it);
      itemsByOrder.set(it.order_id, arr);
    }
  }

  return ok({
    items: orders.map((o) => ({ ...o, items: itemsByOrder.get(o.id) ?? [] })),
    total: count ?? 0,
    page,
    page_size: pageSize,
  });
}

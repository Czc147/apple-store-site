/**
 * 订单服务端工具：入参校验 + 目标解析（服务端现价，绝不信客户端金额）。
 * /api/orders（下单）与 /api/coupons/validate（用券试算）共用同一套解析，
 * 保证「试算看到的原价」与「下单落库的原价」算法完全一致。
 * ⚠️ 仅供服务端（route handler）import。
 */
import type { supabaseAdmin } from '@/lib/supabase/admin';
import { ORDER_TYPE, type OrderCreateItem, type OrderType } from '@/lib/order-types';

/** 单笔订单最多行项数（与前端结算清单一致） */
export const MAX_ORDER_ITEMS = 20;

const VALID_REF_TYPES: OrderType[] = [ORDER_TYPE.SUB_UNIT, ORDER_TYPE.SUBSCRIPTION];

/** 解析出的行项（含服务端现价与派发用卡密商品） */
export interface ResolvedOrderItem {
  ref_type: OrderType;
  ref_id: string;
  quantity: number;
  name: string;
  price: string;
  card_product_id: string;
}

/** 校验请求体里的 items（类型 / 数量 / 同类约束） */
export function parseOrderItems(
  raw: unknown,
): { ok: true; items: OrderCreateItem[]; orderType: OrderType } | { ok: false; error: string } {
  const rawItems: unknown[] = Array.isArray(raw) ? raw : [];
  if (rawItems.length === 0) return { ok: false, error: '订单没有商品' };
  if (rawItems.length > MAX_ORDER_ITEMS) {
    return { ok: false, error: `一次最多下单 ${MAX_ORDER_ITEMS} 个商品` };
  }

  const items: OrderCreateItem[] = [];
  let orderType: OrderType | null = null;
  for (const item of rawItems) {
    const it = (item ?? {}) as Record<string, unknown>;
    const refType = it.ref_type as OrderType;
    const refId = typeof it.ref_id === 'string' ? it.ref_id.trim() : '';
    const quantity = it.quantity;
    if (!VALID_REF_TYPES.includes(refType)) {
      return { ok: false, error: 'ref_type 必须为 sub_unit / subscription' };
    }
    if (!refId) return { ok: false, error: 'ref_id 为必填字段' };
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return { ok: false, error: 'quantity 必须为 1–100 的整数' };
    }
    if (orderType && orderType !== refType) {
      return { ok: false, error: '同一订单只能包含同类商品（小单元或订阅）' };
    }
    orderType = refType;
    items.push({ ref_type: refType, ref_id: refId, quantity });
  }
  return { ok: true, items, orderType: orderType as OrderType };
}

/** 解析单个目标：存在性 + 名称 + 现价 + 启用卡密商品；缺失返回 null */
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

/** 批量解析目标（顺序执行，失败即返回可读错误） */
export async function resolveOrderItems(
  db: ReturnType<typeof supabaseAdmin>,
  items: OrderCreateItem[],
): Promise<{ ok: true; resolved: ResolvedOrderItem[]; total: string } | { ok: false; error: string; status: number }> {
  const resolved: ResolvedOrderItem[] = [];
  for (const item of items) {
    const target = await resolveTarget(db, item);
    if (!target) {
      return {
        ok: false,
        status: 409,
        error: item.ref_type === ORDER_TYPE.SUB_UNIT ? '商品不存在或已下架' : '订阅不存在或已下架',
      };
    }
    resolved.push({ ...item, ...target });
  }
  const total = resolved
    .reduce((sum, r) => sum + Number(r.price) * r.quantity, 0)
    .toFixed(2);
  return { ok: true, resolved, total };
}

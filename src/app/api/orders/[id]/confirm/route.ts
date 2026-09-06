import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { resolveTargetContent } from '@/lib/card-targets';
import { ORDER_TYPE } from '@/lib/order-types';
import type { Order, OrderItem } from '@/lib/order-types';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 映射 deliver_card_keys 的异常到对外响应（同前台取卡口径） */
function mapDeliverError(message: string): string | null {
  if (
    message.includes('INSUFFICIENT_STOCK') ||
    message.includes('PRODUCT_DISABLED')
  ) {
    return '卡密库存不足或商品已停售，请先补货后再确认';
  }
  if (message.includes('DELIVERY_NOT_FOUND') || message.includes('TOKEN_MISMATCH')) {
    return '派发记录异常，请联系客服';
  }
  if (message.includes('DELIVERY_CANCELLED')) return '该行派发已取消，无法确认';
  if (message.includes('KEYS_REISSUED')) return '该行卡密已售后调整，请联系客服';
  return null;
}

/** 为确认成功写一条通知（订阅解锁 / 新密钥入库） */
async function writeNotification(
  order: Order,
  itemCount: number,
  keyCount: number,
) {
  const body =
    itemCount > 1
      ? `订单 ${order.order_no} 已确认，${keyCount} 份内容已发送到我的库`
      : `订单 ${order.order_no} 已确认，内容已发送到我的库`;
  const { error } = await supabaseAdmin().from('notifications').insert({
    user_id: order.user_id,
    title: '您的订单已确认',
    body,
    payload: { ref_type: 'order', order_id: order.id, order_no: order.order_no, url: '/library' },
  });
  if (error) console.warn('[order-confirm] 写通知失败:', error.message);
}

/**
 * POST /api/orders/[id]/confirm — 管理员确认收款并派发（幂等）
 *
 * 流程：status→paid → 逐行调 deliver_card_keys(order_id="order_no:line_index") →
 * 每个发放的密钥写权益（sub_unit→kind='content'；subscription→grant_subscription）+ 写通知。
 * 幂等：deliver_card_keys（已发放原样返回）+ 权益唯一索引兜底；
 *       已支付的订单可安全重放（重复确认结果一致）。
 * 部分行失败：返回错误、订单保持 pending，已成功行在重试时幂等跳过。
 */
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const db = supabaseAdmin();
  const orderId = ctx.params.id;

  const { data: order, error: orderErr } = await db
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr) return fail(orderErr.message, 500);
  if (!order) return fail('订单不存在', 404);
  if (order.status === 'canceled') return fail('订单已取消，无法确认', 409);

  const { data: items, error: itemsErr } = await db
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('line_index', { ascending: true });
  if (itemsErr) return fail(itemsErr.message, 500);

  const orderItems = (items ?? []) as OrderItem[];
  const orderNo = (order as Order).order_no;
  const userEmail = (order as Order).user_email;

  // 取每行的派发单（claim_token）：order_id = "order_no:line_index"
  const deliveryOrderIds = orderItems.map((it) => `${orderNo}:${it.line_index}`);
  const { data: deliveries, error: delErr } = await db
    .from('card_deliveries')
    .select('order_id, card_product_id, claim_token')
    .in('order_id', deliveryOrderIds);
  if (delErr) return fail(delErr.message, 500);
  const deliveryByOrderId = new Map<string, { claim_token: string; card_product_id: string }>();
  for (const d of (deliveries ?? []) as Array<{
    order_id: string;
    claim_token: string;
    card_product_id: string;
  }>) {
    deliveryByOrderId.set(d.order_id, { claim_token: d.claim_token, card_product_id: d.card_product_id });
  }

  // 预取订阅行需要的有效天数（每订阅一次）
  const subIds = [...new Set(orderItems.filter((i) => i.line_type === ORDER_TYPE.SUBSCRIPTION).map((i) => i.ref_id))];
  const durationBySub = new Map<string, number | null>();
  if (subIds.length > 0) {
    const { data: subs, error: subErr } = await db
      .from('subscriptions')
      .select('id, unlock_duration_days')
      .in('id', subIds);
    if (subErr) return fail(subErr.message, 500);
    for (const s of (subs ?? []) as Array<{ id: string; unlock_duration_days: number | null }>) {
      durationBySub.set(s.id, s.unlock_duration_days);
    }
  }

  // 逐行派发（顺序执行，失败即中断；已成功行幂等可重试）
  let totalKeys = 0;
  for (const item of orderItems) {
    const deliveryId = `${orderNo}:${item.line_index}`;
    const delivery = deliveryByOrderId.get(deliveryId);
    if (!delivery) return fail(`订单行 ${item.line_index} 缺少派发记录`, 500);

    const { data: keys, error: rpcError } = await db.rpc('deliver_card_keys', {
      p_order_id: deliveryId,
      p_claim_token: delivery.claim_token,
    });
    if (rpcError) {
      console.warn('[order-confirm] 派发失败:', rpcError.message, 'delivery_id =', deliveryId);
      return fail(mapDeliverError(rpcError.message ?? '') ?? `派发失败：${rpcError.message}`, 409);
    }
    const delivered = (keys ?? []) as Array<{ id: string; card_product_id: string }>;
    if (delivered.length === 0) return fail(`订单行 ${item.line_index} 无卡密，无法确认`, 409);
    totalKeys += delivered.length;

    if (item.line_type === ORDER_TYPE.SUB_UNIT) {
      await grantContentEntitlements(db, item, delivered, (order as Order).user_id, userEmail);
    } else {
      await grantSubscriptionEntitlement(
        db,
        item,
        delivered,
        (order as Order).user_id,
        userEmail,
        durationBySub,
      );
    }

    const { error: markErr } = await db
      .from('order_items')
      .update({ delivered_at: new Date().toISOString() })
      .eq('id', item.id);
    if (markErr) return fail(markErr.message, 500);
  }

  // 全部行成功 → 置为已确认
  const { error: paidErr } = await db
    .from('orders')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', orderId);
  if (paidErr) return fail(paidErr.message, 500);

  await writeNotification(order as Order, orderItems.length, totalKeys);

  return ok({ order_no: orderNo, status: 'paid', delivered_count: totalKeys });
}

/** sub_unit 行：每密钥写一条 content 权益（幂等，冲突忽略） */
async function grantContentEntitlements(
  db: ReturnType<typeof supabaseAdmin>,
  item: OrderItem,
  delivered: Array<{ id: string; card_product_id: string }>,
  userId: string,
  userEmail: string | null,
) {
  let name = item.name;
  let mediaUrl: string | null = null;
  try {
    const c = await resolveTargetContent('sub_unit', item.ref_id);
    if (c) {
      name = c.name || item.name;
      mediaUrl = c.redeem_image_url;
    }
  } catch {
    /* 解析失败回退行项名称快照 */
  }

  for (const key of delivered) {
    const { error } = await db.from('user_entitlements').insert({
      user_id: userId,
      user_email: userEmail,
      kind: 'content',
      card_key_id: key.id,
      name,
      media_url: mediaUrl,
      target_type: 'sub_unit',
      target_id: item.ref_id,
      source: 'order',
    });
    if (error && error.code !== '23505') {
      throw new Error(`写入权益失败：${error.message}`);
    }
  }
}

/** subscription 行：调 grant_subscription 写一条订阅权益（原子叠加） */
async function grantSubscriptionEntitlement(
  db: ReturnType<typeof supabaseAdmin>,
  item: OrderItem,
  delivered: Array<{ id: string; card_product_id: string }>,
  userId: string,
  userEmail: string | null,
  durationBySub: Map<string, number | null>,
) {
  const duration = durationBySub.get(item.ref_id) ?? null;
  const { error } = await db.rpc('grant_subscription', {
    p_user_id: userId,
    p_user_email: userEmail,
    p_subscription_id: item.ref_id,
    p_card_key_id: delivered[0].id,
    p_duration_days: duration,
    p_source: 'order',
  });
  if (error) throw new Error(`写入订阅权益失败：${error.message}`);
}

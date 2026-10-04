import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { notifyNewOrder } from '@/lib/serverchan';
import { parseOrderItems, resolveOrderItems } from '@/lib/orders-server';
import { perPersonPrice } from '@/lib/group-buy-server';
import { validateCouponCode } from '@/lib/coupons-server';
import {
  computeVipDiscount,
  loadApplicableDiscount,
  resolveBestDiscount,
} from '@/lib/vip-benefits';
import {
  ORDER_TYPE,
  ORDER_STATUS,
  PAYMENT_METHOD,
  type OrderType,
  type PaymentMethod,
  type OrderStatus,
  type Order,
  type OrderItem,
} from '@/lib/order-types';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const VALID_PAYMENT: PaymentMethod[] = [PAYMENT_METHOD.WECHAT, PAYMENT_METHOD.ALIPAY];

/** 生成可读订单号：Z + 年月日时分秒 + 2 字节随机 hex（唯一冲突时重试） */
function genOrderNo(): string {
  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const ts =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `Z${ts}${randomBytes(2).toString('hex').toUpperCase()}`;
}

function mapCreateOrderError(message: string): { error: string; status: number } {
  if (message.includes('COUPON_LOCK_FAILED')) {
    return { error: '该优惠码状态刚发生变化，请重新提交一次', status: 409 };
  }
  if (message.includes('GROUP_BUY_ALREADY_ORDERED')) {
    return { error: '你已经为这个拼单推送过订单了', status: 409 };
  }
  if (message.includes('GROUP_BUY_NOT_FULL')) {
    return { error: '拼单还没满员，暂时不能按拼单价下单', status: 409 };
  }
  return { error: message, status: 500 };
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
 * 请求体：{ items: [{ ref_type, ref_id, quantity }], payment_method, coupon_code? }
 * 校验：ref_type ∈ sub_unit|subscription；目标存在且有启用卡密商品；quantity 1–100。
 * 金额/名称由服务端按目标表现算（防篡改）；带 coupon_code 时同一处校验并重算实付：
 * total 存原价合计、discount_amount 存优惠金额（实付 = total - discount_amount）。
 * 库存不足不硬拦截（允许先建单后补货，确认环节再校验）。
 *
 * 响应 201：{ order_no, total, discount_amount, payable, type, payment_method }
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

  // 逐条解析 + 校验（订单类型必须一致：愿望单=sub_unit，订阅=subscription）
  const parsed = parseOrderItems(body.items);
  if (!parsed.ok) return fail(parsed.error);
  const { items, orderType } = parsed;

  const db = supabaseAdmin();

  // 解析每个目标：存在性 + 名称 + 金额（服务端现值） + 启用卡密商品
  const resolvedResult = await resolveOrderItems(db, items);
  if (!resolvedResult.ok) return fail(resolvedResult.error, resolvedResult.status);
  const { resolved } = resolvedResult;
  // 拼单会覆盖这个金额（改成分摊价），所以是 let
  let total = resolvedResult.total;

  // 一起买（迁移 029）：成团后按**分摊价**下单。
  // 价格在这里现算并覆盖，**不接受客户端传价** —— 与全站「金额由服务端按目标表现算」
  // 的口径一致，否则改个请求体就能一分钱拼单。
  const groupBuyId =
    typeof body.group_buy_id === 'string' ? body.group_buy_id.trim() : '';
  if (groupBuyId) {
    const gb = await resolveGroupBuyOrder(db, groupBuyId, user.id, items);
    if (!gb.ok) return fail(gb.error, gb.status);
    total = gb.total;
  }

  // 优惠券（可选）：服务端权威校验，但**先不锁券** —— 要跟 VIP 折扣比价后才能决定用不用它
  const couponCode = typeof body.coupon_code === 'string' ? body.coupon_code.trim() : '';
  /** 券未被占用 → 稍后直接锁它 */
  let couponClaimId: string | null = null;
  /** 券被**用户自己**那笔未付款旧单占用 → 券胜出时顶单（作废旧单 + 把券转过来） */
  let couponConflict: { claimId: string; holderOrderId: string } | null = null;
  /** 券在试算之后失效了（过期/停用…）→ 见下方说明，不拒单 */
  let couponUnresolved: { error: string; discount: number } | null = null;
  let couponDiscount = 0;

  if (couponCode) {
    const check = await validateCouponCode(db, couponCode, user.id, Number(total), orderType);
    if (check.ok) {
      couponDiscount = check.discount;
      if (check.claim.order_id) {
        // 券本身可用，只是被**用户自己**某笔未付款订单占着 → 券胜出时顶单
        couponConflict = { claimId: check.claim.id, holderOrderId: check.claim.order_id };
      } else {
        couponClaimId = check.claim.id;
      }
    } else {
      // 券在推送前失效时不再计入折扣，避免失效券继续造成资损。
      // 订单按原价落库并返回警告，用户可补差或联系客服处理。
      couponUnresolved = { error: check.error, discount: 0 };
      couponDiscount = 0;
      console.warn(
        '[orders] 券在推送时已不可用 —— 本单按原价记账、券未核销：',
        couponCode,
        check.error,
      );
    }
  }

  // VIP 折扣（迁移 023）：与优惠券**不叠加，取更优**（用户 2026-09-22 拍板）
  const vip = await loadApplicableDiscount(db, user.id, orderType);
  const vipDiscount = vip ? computeVipDiscount(vip.percent, Number(total)) : 0;
  const best = resolveBestDiscount({
    couponDisc: couponDiscount,
    vipDisc: vipDiscount,
  });
  const discountAmount = best.amount;
  const discountSource = best.source;

  // VIP 胜出时这张券原封不动留给用户下次用：不记 code、不锁券、**也不顶单**
  // （券本来就没被用掉，作废用户那笔旧单属于无端破坏）
  const usedCouponCode = discountSource === 'coupon' ? couponCode : '';
  if (discountSource !== 'coupon') {
    couponClaimId = null;
    couponConflict = null;
  }

  const payable = Math.round((Number(total) - discountAmount) * 100) / 100;

  const itemsPayload = resolved.map((item, index) => ({
    line_index: index,
    line_type: item.ref_type,
    ref_id: item.ref_id,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    card_product_id: item.card_product_id,
    claim_token: randomBytes(16).toString('hex'),
  }));

  const orderNo = genOrderNo();
  const { data: createdOrder, error: orderErr } = await db.rpc('create_order', {
    p_order_no: orderNo,
    p_user_id: user.id,
    p_user_email: user.email,
    p_total: total,
    p_order_type: orderType,
    p_payment_method: paymentMethod,
    p_coupon_code: usedCouponCode || null,
    p_discount_amount: discountAmount,
    p_discount_source: discountSource,
    p_items: itemsPayload,
    p_coupon_claim_id: couponClaimId ?? couponConflict?.claimId ?? null,
    p_coupon_holder_order_id: couponConflict?.holderOrderId ?? null,
    p_group_buy_id: groupBuyId || null,
  });
  if (orderErr) {
    const mapped = mapCreateOrderError(orderErr.message ?? '');
    return fail(mapped.error, mapped.status);
  }
  if (!createdOrder) return fail('订单创建失败，请稍后再试', 500);

  // 新订单通知（Server酱 → 微信）：后台配置了 SendKey 才发；失败静默，不阻塞下单成功
  try {
    await notifyNewOrder(db, orderNo, payable, resolved.length, paymentMethod);
  } catch {
    /* 推送失败不影响下单结果 */
  }

  return ok(
    {
      order_no: orderNo,
      total: Number(total),
      discount_amount: discountAmount,
      payable,
      type: orderType,
      payment_method: paymentMethod,
      // 本单优惠来自券还是 VIP 折扣：前端据它决定提示文案
      // （用户填了码却减得少时，需要告诉他是因为 VIP 更划算、券没被用掉）
      discount_source: discountSource,
      /** VIP 折扣百分比，仅在 source='vip' 时有意义；券胜出时为 null */
      vip_percent: discountSource === 'vip' && vip ? vip.percent : null,
      /** 有值时表示：用户提交的券在推送时已不可用，本单按原价记账且券未核销。 */
      coupon_warning: couponUnresolved ? couponUnresolved.error : null,
    },
    201,
  );
}

/**
 * 拼单下单前的校验与取价（迁移 029）。
 *
 * 五道闸，任何一条不满足都不允许按分摊价下单：
 *   1. 团存在、且**已成团**（full）—— 没满员就按原价，那就不叫拼单了
 *   2. 我在这个团里
 *   3. 我还没推送过订单（避免一个人占多份分摊价）
 *   4. 订单里的商品就是该团绑定的那个小单元，且数量为 1
 *   5. 小单元还在、价格可算
 *
 * 金额 = 小单元原价 ÷ 成团人数，**服务端现算**，不读任何客户端传来的数值。
 */
async function resolveGroupBuyOrder(
  db: ReturnType<typeof supabaseAdmin>,
  groupBuyId: string,
  userId: string,
  items: Array<{ ref_type: string; ref_id: string; quantity: number }>,
): Promise<{ ok: true; total: string } | { ok: false; error: string; status: number }> {
  const { data: gb } = await db
    .from('group_buys')
    .select('id, status, sub_unit_id, target_count')
    .eq('id', groupBuyId)
    .maybeSingle();
  if (!gb) return { ok: false, error: '拼单不存在', status: 404 };
  if (gb.status !== 'full') {
    return { ok: false, error: '拼单还没满员，暂时不能按拼单价下单', status: 409 };
  }

  const { data: member } = await db
    .from('group_buy_members')
    .select('id, order_id')
    .eq('group_buy_id', groupBuyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!member) return { ok: false, error: '你不在这个拼单里', status: 403 };
  if (member.order_id) {
    return { ok: false, error: '你已经为这个拼单推送过订单了', status: 409 };
  }

  if (items.length !== 1) {
    return { ok: false, error: '拼单一次只能下单该拼单对应的商品', status: 400 };
  }
  const item = items[0];
  if (item.ref_type !== ORDER_TYPE.SUB_UNIT || item.ref_id !== gb.sub_unit_id) {
    return { ok: false, error: '订单商品与该拼单不一致', status: 400 };
  }
  if (item.quantity !== 1) {
    return { ok: false, error: '拼单商品数量必须为 1', status: 400 };
  }

  const { data: sub } = await db
    .from('sub_units')
    .select('price')
    .eq('id', gb.sub_unit_id)
    .eq('enabled', true)
    .maybeSingle();
  if (!sub) return { ok: false, error: '该商品已下架', status: 404 };

  const per = perPersonPrice(Number(sub.price), gb.target_count as number);
  if (per <= 0) return { ok: false, error: '拼单价异常，请联系客服', status: 400 };

  return { ok: true, total: per.toFixed(2) };
}

/**
 * 取该用户此刻适用于这种订单的 VIP 折扣（迁移 023）。
 * 只认**未过期**的订阅权益；多个订阅都有折扣时取百分比最高的那个。
 * 任何一步失败都返回 null —— 优惠是加分项，不能因为它让下单失败。
 */


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

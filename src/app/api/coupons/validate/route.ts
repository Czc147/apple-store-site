import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { parseOrderItems, resolveOrderItems } from '@/lib/orders-server';
import { validateCouponCode } from '@/lib/coupons-server';
import {
  computeVipDiscount,
  loadApplicableDiscount,
  resolveBestDiscount,
} from '@/lib/vip-benefits';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/**
 * POST /api/coupons/validate — **结算试算**（登录用户，Bearer 鉴权）
 *
 * 请求体：{ code?, items: [{ ref_type, ref_id, quantity }] }
 * 与下单走同一套服务端解析（lib/orders-server）算出原价，再给出优惠与实付
 * —— 保证「试算看到的数」和「下单落库的数」一致。
 * 真正的权威校验在下单时再做一遍（本接口只是预览，**不锁券**）。
 *
 * ⚠️ **`code` 是选填的**（2026-09-24 改）。原来这里第一行 `if (!code) return fail(...)`，
 * 导致**有会员卡但没填券码的用户永远算不出折扣**：结算页显示原价，而订单却按折扣落库，
 * 用户照界面原价付款 → 账实不符（多收）。VIP 折扣的口径与券完全共用 lib/vip-benefits，
 * 所以无券时直接走同一条比价链路即可。
 *
 * 响应只**新增**字段，带券时旧的平铺字段照旧返回（向后兼容）：
 * {
 *   original_total, discount_amount, payable, effective_source,   // 本单实际生效
 *   coupon: null | { code, coupon_id, name, type, value, discount_amount, effective },
 *   vip:    null | { percent, discount_amount, better },
 * }
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);
  if (!rateLimit('coupon-validate', getClientIp(req), 40, 60_000)) {
    return fail('操作过于频繁，请稍后再试', 429);
  }

  const body = await parseBody(req);
  // 券码可选：不填就只算 VIP 会员折扣
  const code = typeof body?.code === 'string' ? body.code.trim() : '';

  const parsed = parseOrderItems(body?.items);
  if (!parsed.ok) return fail(parsed.error);

  const db = supabaseAdmin();
  const resolved = await resolveOrderItems(db, parsed.items);
  if (!resolved.ok) return fail(resolved.error, resolved.status);

  const original = Number(resolved.total);

  // 券（可选）：没填码就完全不碰券
  const couponCheck = code
    ? await validateCouponCode(db, code, user.id, original)
    : null;
  if (couponCheck && !couponCheck.ok) return fail(couponCheck.error, couponCheck.status);
  const coupon = couponCheck && couponCheck.ok ? couponCheck : null;

  // VIP 比价（迁移 023）：与券**不叠加，取更优**。这里只做预览，
  // 真正的取舍在下单时再算一遍（口径共用 lib/vip-benefits.ts，两处必然一致）。
  const vip = await loadApplicableDiscount(db, user.id, parsed.orderType);
  const vipDiscount = vip ? computeVipDiscount(vip.percent, original) : 0;
  const best = resolveBestDiscount({
    couponDisc: coupon?.discount ?? 0,
    vipDisc: vipDiscount,
  });

  return ok({
    original_total: original,
    // discount_amount / payable 给的是**本单实际生效**的数：
    // VIP 更划算时这里就是 VIP 的折扣，前端据此显示的实付与下单结果一致
    discount_amount: best.amount,
    payable: Math.round((original - best.amount) * 100) / 100,
    /** 本单优惠来自券还是 VIP；为 'vip' 时这张券不会被核销；两者都没有时是 null */
    effective_source: best.source,
    /** 券这一侧的结构化信息（没填码时为 null） */
    coupon: coupon
      ? {
          code: coupon.claim.code,
          coupon_id: coupon.coupon.id,
          name: coupon.coupon.name,
          type: coupon.coupon.type,
          value: Number(coupon.coupon.value),
          discount_amount: coupon.discount,
          effective: best.source === 'coupon',
          /**
           * 这张券正被**用户自己**某笔未付款订单占着：下单时会自动作废那笔旧单、
           * 把券转过来（见 lib/coupons-server.ts 的 supersedeClaimForOrder）。
           * 界面必须在用户付款**之前**把这话说清楚 —— 付款在前、推送在后。
           */
          will_supersede: coupon.claim.order_id !== null,
        }
      : null,
    /** VIP 折扣信息；没有可用折扣时为 null */
    vip: vip
      ? {
          percent: vip.percent,
          discount_amount: vipDiscount,
          better: best.source === 'vip',
        }
      : null,
    /**
     * 会员卡（供结算页显示「使用会员卡 · 金卡」那一列，排在券的下一列）。
     * 与 `vip` 的区别：这里带**卡名**。没有可用会员折扣时为 null。
     */
    member_card: vip
      ? {
          label: vip.cardLabel,
          percent: vip.percent,
          discount_amount: vipDiscount,
          /** 本单生效的是不是会员折扣（否 = 券更划算，本单用券） */
          effective: best.source === 'vip',
        }
      : null,
    // ↓ 兼容旧调用者的平铺字段：只在带券时出现，行为与改动前一致
    ...(coupon
      ? {
          code: coupon.claim.code,
          coupon_id: coupon.coupon.id,
          name: coupon.coupon.name,
          type: coupon.coupon.type,
          value: Number(coupon.coupon.value),
          coupon_discount_amount: coupon.discount,
        }
      : {}),
  });
}

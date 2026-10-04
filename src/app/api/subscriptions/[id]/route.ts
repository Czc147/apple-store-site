import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody, toNullableText } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { parseUnlockDurationDays } from '@/lib/card-redeem-fields';
import {
  parseBenefits,
  parseCardStyle,
  parseDateTime,
  parseDiscountPercent,
  parseDiscountScope,
} from '@/lib/vip-benefits';
import { normalizeSubscriptionType, SUBSCRIPTION_TYPE } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** GET /api/subscriptions/:id */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('subscriptions')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('订阅不存在', 404);

  // 订阅挂券（迁移 033 / 044）：回填「已加入的券」与每张的数量，按配置顺序返回
  const { data: links } = await db
    .from('subscription_coupons')
    .select('coupon_id, sort_order, quantity')
    .eq('subscription_id', params.id)
    .order('sort_order', { ascending: true });

  const couponLinks = (links ?? []).map((l) => {
    const row = l as { coupon_id: string; quantity?: number | string | null };
    const qty = Math.floor(Number(row.quantity));
    return {
      coupon_id: row.coupon_id,
      quantity: Number.isFinite(qty) && qty > 0 ? Math.min(qty, MAX_COUPON_QUANTITY) : 1,
    };
  });

  return ok({
    ...data,
    coupons: couponLinks,
    // 兼容只读 id 的旧调用方
    coupon_ids: couponLinks.map((c) => c.coupon_id),
  });
}

/** 单次购买每张券最多发几张（与迁移 044 的 check 约束一致） */
const MAX_COUPON_QUANTITY = 999;

/**
 * 归一化后台提交的券关联。
 * 新格式 `coupons: [{ coupon_id, quantity }]`；旧格式 `coupon_ids: string[]` 按每张 1 张处理。
 * 两个字段都没给 → null（表示这次不动券关联）；给了空数组 → 清空。
 * 同一张券重复出现只保留第一条（主键是 subscription_id + coupon_id）。
 */
function normalizeCouponLinks(
  coupons: unknown,
  couponIds: unknown,
): Array<{ coupon_id: string; quantity: number }> | null {
  const raw: Array<{ id: unknown; qty: unknown }> = [];
  if (Array.isArray(coupons)) {
    for (const item of coupons) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      raw.push({ id: row.coupon_id ?? row.id, qty: row.quantity });
    }
  } else if (Array.isArray(couponIds)) {
    for (const id of couponIds) raw.push({ id, qty: 1 });
  } else {
    return null;
  }

  const seen = new Set<string>();
  const out: Array<{ coupon_id: string; quantity: number }> = [];
  for (const { id, qty } of raw) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    const parsed = Math.floor(Number(qty));
    out.push({
      coupon_id: id,
      quantity:
        Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_COUPON_QUANTITY) : 1,
    });
  }
  return out;
}

/** PUT /api/subscriptions/:id — 局部更新（需登录） */
export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }
  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');

  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  for (const key of ['price', 'duration', 'description', 'payment_url', 'link_url', 'redeem_image_url', 'sort_order'] as const) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  if (body.type !== undefined) {
    // 归一化在 lib/types.ts 一处实现，POST 与 PUT 共用（别各写一遍白名单）
    patch.type = normalizeSubscriptionType(body.type);
  }
  if (body.unlock_duration_days !== undefined) {
    const days = parseUnlockDurationDays(body.unlock_duration_days);
    if (!days.ok) return fail(days.error);
    patch.unlock_duration_days = days.value;
  }
  // 会员卡与 VIP 折扣（迁移 023）。四个字段都是「未提供 = 不动，提供了空值 = 清空」，
  // 所以先判 !== undefined 再解析，不能用 parseX(body.x).value 直接赋值。
  if (body.card_style !== undefined) {
    const card = parseCardStyle(body.card_style);
    if (!card.ok) return fail(card.error);
    patch.card_style = card.value;
  }
  if (body.card_text !== undefined) {
    patch.card_text = toNullableText(body.card_text);
  }
  if (body.discount_percent !== undefined) {
    const percent = parseDiscountPercent(body.discount_percent);
    if (!percent.ok) return fail(percent.error);
    patch.discount_percent = percent.value;
  }
  if (body.discount_scope !== undefined) {
    const scope = parseDiscountScope(body.discount_scope);
    if (!scope.ok) return fail(scope.error);
    patch.discount_scope = scope.value;
  }
  if (body.discount_valid_from !== undefined) {
    const from = parseDateTime(body.discount_valid_from, '优惠开始时间');
    if (!from.ok) return fail(from.error);
    patch.discount_valid_from = from.value;
  }
  if (body.discount_valid_to !== undefined) {
    const to = parseDateTime(body.discount_valid_to, '优惠结束时间');
    if (!to.ok) return fail(to.error);
    patch.discount_valid_to = to.value;
  }

  // 高级设置（迁移 036）：纯展示字段。同样是"未提供 = 不动，提供了空值 = 清空"
  if (body.badge_text !== undefined) patch.badge_text = toNullableText(body.badge_text);
  if (body.terms_text !== undefined) patch.terms_text = toNullableText(body.terms_text);
  if (body.benefits !== undefined) {
    const benefits = parseBenefits(body.benefits);
    if (!benefits.ok) return fail(benefits.error);
    patch.benefits = benefits.value;
  }
  if (body.is_featured !== undefined) patch.is_featured = body.is_featured === true;
  if (Object.keys(patch).length === 0) return fail('没有可更新的字段');

  const { data, error } = await supabaseAdmin()
    .from('subscriptions')
    .update(patch)
    .eq('id', params.id)
    .select()
    .maybeSingle();
  if (error) {
    if (error.code === '23505') {
      return fail('每日计划订阅已存在，最多只能有一条', 409);
    }
    return fail(error.message, 500);
  }
  if (!data) return fail('订阅不存在', 404);

  // 订阅挂券（迁移 033 / 044）：给了 coupons（或旧字段 coupon_ids）就**整体替换**，
  // 数组顺序即发放顺序，quantity = 这张券发几张。三种订阅类型都允许挂券。
  // 放在行更新之后：这样行本身的错误（409 每日计划重复 / 404）不会先动到关联。
  // ⚠️ 先删后插，Supabase JS 没有多语句事务 —— 中途失败最多是"券没了"，
  //    后台再存一次即可恢复，不会留下删一半的脏数据。
  const couponLinks = normalizeCouponLinks(body.coupons, body.coupon_ids);
  if (couponLinks) {
    const { error: delErr } = await supabaseAdmin()
      .from('subscription_coupons')
      .delete()
      .eq('subscription_id', params.id);
    if (delErr) return fail(delErr.message, 500);

    if (couponLinks.length > 0) {
      const { error: insErr } = await supabaseAdmin()
        .from('subscription_coupons')
        .insert(
          couponLinks.map((link, i) => ({
            subscription_id: params.id,
            coupon_id: link.coupon_id,
            quantity: link.quantity,
            sort_order: i,
          })),
        );
      if (insErr) return fail(insErr.message, 500);
    }
  }

  return ok(data);
}

/** DELETE /api/subscriptions/:id（需登录） */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }
  const { error } = await supabaseAdmin()
    .from('subscriptions')
    .delete()
    .eq('id', params.id);
  if (error) return fail(error.message, 500);
  return ok({ success: true, id: params.id });
}

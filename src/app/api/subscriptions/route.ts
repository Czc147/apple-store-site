import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody, toSortOrder, toNullableText } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { parseUnlockDurationDays } from '@/lib/card-redeem-fields';
import {
  parseBenefits,
  parseCardStyle,
  parseDateTime,
  parseDiscountPercent,
  parseDiscountScope,
} from '@/lib/vip-benefits';
import {
  normalizeSubscriptionType,
  SUBSCRIPTION_TYPE,
  type SubscriptionType,
} from '@/lib/types';
import { PUT as putById, DELETE as deleteById } from './[id]/route';

export const dynamic = 'force-dynamic';

/** GET /api/subscriptions — 订阅套餐列表（sort_order 升序） */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }
  const admin = checkAdmin(req);
  let query = supabaseAdmin()
    .from('subscriptions')
    .select(
      admin
        ? '*'
        : 'id, name, price, duration, description, payment_url, link_url, type, sort_order, card_style, card_text, discount_percent, discount_scope, discount_valid_from, discount_valid_to, badge_text, benefits, terms_text, is_featured, created_at',
    )
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (!admin) query = query.eq('enabled', true);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return ok(data);
}

/** POST /api/subscriptions — 新建订阅套餐（需登录） */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }
  const body = await parseBody(req);
  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    return fail('name 为必填字段');
  }

  const price =
    typeof body.price === 'number' && Number.isFinite(body.price)
      ? body.price
      : 0;

  // 三分类（迁移 032）：normal 普通 / daily_plan 高级 / coupon 卡券订阅。
  // 用共用归一化函数，别再在 POST 与 PUT 各写一遍白名单（会漂移）
  const type: SubscriptionType = normalizeSubscriptionType(body.type);

  // 解锁天数仅高级订阅（daily_plan）有意义；普通订阅与卡券订阅一律落 null，避免留脏字段
  const days = parseUnlockDurationDays(body.unlock_duration_days);
  if (!days.ok) return fail(days.error);
  const unlockDurationDays =
    type === SUBSCRIPTION_TYPE.DAILY_PLAN ? days.value : null;

  // 会员卡与 VIP 折扣（迁移 023）——解析口径与 PUT 共用，见 lib/vip-benefits.ts
  const card = parseCardStyle(body.card_style);
  if (!card.ok) return fail(card.error);
  const percent = parseDiscountPercent(body.discount_percent);
  if (!percent.ok) return fail(percent.error);
  const scope = parseDiscountScope(body.discount_scope);
  if (!scope.ok) return fail(scope.error);
  const validFrom = parseDateTime(body.discount_valid_from, '优惠开始时间');
  if (!validFrom.ok) return fail(validFrom.error);
  const validTo = parseDateTime(body.discount_valid_to, '优惠结束时间');
  if (!validTo.ok) return fail(validTo.error);

  // 高级设置（迁移 036）：纯展示字段
  const benefits = parseBenefits(body.benefits);
  if (!benefits.ok) return fail(benefits.error);

  const { data, error } = await supabaseAdmin()
    .from('subscriptions')
    .insert({
      name: body.name.trim(),
      price,
      duration: toNullableText(body.duration),
      description: toNullableText(body.description),
      payment_url: toNullableText(body.payment_url),
      link_url: toNullableText(body.link_url),
      redeem_image_url: toNullableText(body.redeem_image_url),
      type,
      unlock_duration_days: unlockDurationDays,
      card_style: card.value,
      card_text: toNullableText(body.card_text),
      discount_percent: percent.value,
      discount_scope: scope.value,
      discount_valid_from: validFrom.value,
      discount_valid_to: validTo.value,
      // 高级设置（迁移 036）：纯展示，不参与任何业务判定
      badge_text: toNullableText(body.badge_text),
      benefits: benefits.value,
      terms_text: toNullableText(body.terms_text),
      is_featured: body.is_featured === true,
      sort_order: toSortOrder(body.sort_order),
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      return fail('每日计划订阅已存在，最多只能有一条', 409);
    }
    return fail(error.message, 500);
  }
  return ok(data, 201);
}

/** PUT /api/subscriptions — 更新（请求体携带 id，等价于 PUT /api/subscriptions/:id） */
export async function PUT(req: NextRequest) {
  const peek = await parseBody(req.clone());
  const id = typeof peek?.id === 'string' && peek.id ? peek.id : null;
  if (!id) return fail('缺少 id 字段（或使用 PUT /api/subscriptions/:id）');
  return putById(req, { params: { id } });
}

/** DELETE /api/subscriptions?id=xxx — 删除（id 走 query 或请求体） */
export async function DELETE(req: NextRequest) {
  let id = req.nextUrl.searchParams.get('id');
  if (!id) {
    const peek = await parseBody(req.clone());
    id = typeof peek?.id === 'string' && peek.id ? peek.id : null;
  }
  if (!id) return fail('缺少 id（query 参数或请求体 id 字段）');
  return deleteById(req, { params: { id } });
}

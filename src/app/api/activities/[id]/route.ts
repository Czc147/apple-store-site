import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** GET /api/activities/:id */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { data, error } = await supabaseAdmin()
    .from('activities')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('活动不存在', 404);
  return ok(data);
}

/** PUT /api/activities/:id — 局部更新（需登录） */
export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }
  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');

  const patch: Record<string, unknown> = {};
  for (const key of ['title', 'image_url', 'description', 'link_url', 'redeem_image_url', 'sort_order'] as const) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) return fail('没有可更新的字段');

  const { data, error } = await supabaseAdmin()
    .from('activities')
    .update(patch)
    .eq('id', params.id)
    .select()
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('活动不存在', 404);
  return ok(data);
}

/** DELETE /api/activities/:id（需登录） */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }

  const db = supabaseAdmin();

  // 守卫（迁移 035）：活动删掉会**级联删掉它的券**，而券现在可能还挂在
  // 「卡券订阅」上（迁移 033）—— 静默删掉订阅要发的券属于数据事故。
  // 有订阅在用就拦下，让站长先解绑（或把券改成闲置）。
  const { data: coupons } = await db
    .from('coupons')
    .select('id, name')
    .eq('activity_id', params.id);
  const couponIds = (coupons ?? []).map((c) => (c as { id: string }).id);
  if (couponIds.length > 0) {
    const { data: links } = await db
      .from('subscription_coupons')
      .select('coupon_id')
      .in('coupon_id', couponIds);
    const usedIds = new Set(
      (links ?? []).map((l) => (l as { coupon_id: string }).coupon_id),
    );
    if (usedIds.size > 0) {
      const names = (coupons ?? [])
        .filter((c) => usedIds.has((c as { id: string }).id))
        .map((c) => (c as { name: string }).name)
        .slice(0, 3)
        .join('、');
      return fail(
        `这个活动下有 ${usedIds.size} 张券正被「卡券订阅」使用（${names}${usedIds.size > 3 ? ' 等' : ''}）。` +
          '删活动会把它们一起删掉，订阅就发不出券了 —— 请先在订阅编辑器里移除这些券，或把券改成不绑活动的闲置券。',
        409,
      );
    }
  }

  const { error } = await db.from('activities').delete().eq('id', params.id);
  if (error) return fail(error.message, 500);
  return ok({ success: true, id: params.id });
}

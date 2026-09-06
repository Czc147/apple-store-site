import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody, toSortOrder, toNullableText } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

type Ctx = { params: { id: string } };

/** PUT /api/subscription-products/:id — 编辑订阅仓库商品（需管理员） */
export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');

  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string' && body.title.trim()) {
    patch.title = body.title.trim();
  }
  if (body.description !== undefined) patch.description = toNullableText(body.description);
  if (body.cover_url !== undefined) patch.cover_url = toNullableText(body.cover_url);
  if (body.media_path !== undefined) patch.media_path = toNullableText(body.media_path);
  if (body.link_url !== undefined) patch.link_url = toNullableText(body.link_url);
  if (body.sort_order !== undefined) patch.sort_order = toSortOrder(body.sort_order);
  if (Object.keys(patch).length === 0) return fail('没有可更新的字段');

  const { data, error } = await supabaseAdmin()
    .from('subscription_products')
    .update(patch)
    .eq('id', params.id)
    .select()
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('商品不存在', 404);
  return ok(data);
}

/** DELETE /api/subscription-products/:id — 删除订阅仓库商品（需管理员） */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const { error } = await supabaseAdmin()
    .from('subscription_products')
    .delete()
    .eq('id', params.id);
  if (error) return fail(error.message, 500);
  return ok({ success: true, id: params.id });
}

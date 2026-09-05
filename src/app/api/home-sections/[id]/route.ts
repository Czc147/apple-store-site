import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody, toSortOrder, toNullableText, toStringArray } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

type Ctx = { params: { id: string } };

function toLayout(v: unknown): 'carousel' | 'grid' {
  return v === 'grid' ? 'grid' : 'carousel';
}

/** PUT /api/home-sections/:id — 局部更新（需管理员登录） */
export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');

  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
  if (body.subtitle !== undefined) patch.subtitle = toNullableText(body.subtitle);
  if (body.layout !== undefined) patch.layout = toLayout(body.layout);
  if (body.featured_only !== undefined) patch.featured_only = body.featured_only === true;
  if (body.major_unit_ids !== undefined) patch.major_unit_ids = toStringArray(body.major_unit_ids);
  if (body.enabled !== undefined) patch.enabled = body.enabled === true;
  if (body.sort_order !== undefined) patch.sort_order = toSortOrder(body.sort_order);
  if (Object.keys(patch).length === 0) return fail('没有可更新的字段');
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin()
    .from('home_sections')
    .update(patch)
    .eq('id', params.id)
    .select()
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('板块不存在', 404);
  return ok(data);
}

/** DELETE /api/home-sections/:id（需管理员登录） */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const { error } = await supabaseAdmin()
    .from('home_sections')
    .delete()
    .eq('id', params.id);
  if (error) return fail(error.message, 500);
  return ok({ success: true, id: params.id });
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** GET /api/major-units/:id — 单条查询 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { data, error } = await supabaseAdmin()
    .from('major_units')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('大单元不存在', 404);
  return ok(data);
}

/** PUT /api/major-units/:id — 局部更新（需登录） */
export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }
  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');

  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  for (const key of ['image_url', 'link_url', 'sort_order'] as const) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) return fail('没有可更新的字段');

  const { data, error } = await supabaseAdmin()
    .from('major_units')
    .update(patch)
    .eq('id', params.id)
    .select()
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('大单元不存在', 404);
  return ok(data);
}

/** DELETE /api/major-units/:id — 删除（级联删除其下小单元，需登录） */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }
  const { error } = await supabaseAdmin()
    .from('major_units')
    .delete()
    .eq('id', params.id);
  if (error) return fail(error.message, 500);
  return ok({ success: true, id: params.id });
}

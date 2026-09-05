import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { isValidPickDate } from '@/lib/daily';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

type Ctx = { params: { id: string } };

/** PUT /api/daily-picks/:id — 局部更新（需管理员登录） */
export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');

  const patch: Record<string, unknown> = {};
  if (body.pick_date !== undefined) {
    if (!isValidPickDate(body.pick_date)) return fail('请选择有效日期');
    patch.pick_date = body.pick_date;
  }
  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return fail('标题不能为空');
    patch.title = title;
  }
  for (const key of ['description', 'cover_url', 'media_path', 'link_url'] as const) {
    if (body[key] !== undefined) {
      patch[key] =
        typeof body[key] === 'string' && (body[key] as string).trim() !== ''
          ? (body[key] as string)
          : null;
    }
  }
  if (Object.keys(patch).length === 0) return fail('没有可更新的字段');
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin()
    .from('daily_picks')
    .update(patch)
    .eq('id', params.id)
    .select()
    .maybeSingle();
  if (error) {
    if (error.code === '23505') return fail('该日期已有每日推荐，一天只能有一条', 409);
    return fail(error.message, 500);
  }
  if (!data) return fail('每日推荐不存在', 404);
  return ok(data);
}

/** DELETE /api/daily-picks/:id（需管理员登录） */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const { error } = await supabaseAdmin()
    .from('daily_picks')
    .delete()
    .eq('id', params.id);
  if (error) return fail(error.message, 500);
  return ok({ success: true, id: params.id });
}

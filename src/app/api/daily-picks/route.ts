import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody, toNullableText } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { isValidPickDate } from '@/lib/daily';
import { PUT as putById, DELETE as deleteById } from './[id]/route';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 每日推荐内容预览签名时长（秒，仅后台列表/表单预览） */
const PREVIEW_TTL = 3600;

/**
 * GET /api/daily-picks — 每日推荐列表（需管理员登录；按日期倒序）
 * 为含媒体文件的行现签 1 小时预览链接（media_preview_url），
 * 该链接仅供后台展示：不入数据库、不进前台、不打日志。
 */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const { data, error } = await supabaseAdmin()
    .from('daily_picks')
    .select('*')
    .order('pick_date', { ascending: false });
  if (error) return fail(error.message, 500);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const withPreview = await Promise.all(
    rows.map(async (row) => {
      const mediaPath = typeof row.media_path === 'string' ? row.media_path : null;
      if (!mediaPath) return { ...row, media_preview_url: null };
      const { data: signed, error: signErr } = await supabaseAdmin()
        .storage.from('daily')
        .createSignedUrl(mediaPath, PREVIEW_TTL);
      return {
        ...row,
        media_preview_url: signErr ? null : signed.signedUrl,
      };
    }),
  );
  return ok(withPreview);
}

/**
 * POST /api/daily-picks — 新建每日推荐（需管理员登录）
 * 一天一条：日期冲突返回 409 友好提示。
 */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');
  if (!isValidPickDate(body.pick_date)) return fail('请选择有效日期');
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return fail('title 为必填字段');

  const { data, error } = await supabaseAdmin()
    .from('daily_picks')
    .insert({
      pick_date: body.pick_date,
      title,
      description: toNullableText(body.description),
      cover_url: toNullableText(body.cover_url),
      media_path: toNullableText(body.media_path),
      link_url: toNullableText(body.link_url),
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return fail('该日期已有每日推荐，请直接编辑对应条目', 409);
    return fail(error.message, 500);
  }
  return ok(data, 201);
}

/** PUT /api/daily-picks — 更新（请求体携带 id，等价于 PUT /api/daily-picks/:id） */
export async function PUT(req: NextRequest) {
  const peek = await parseBody(req.clone());
  const id = typeof peek?.id === 'string' && peek.id ? peek.id : null;
  if (!id) return fail('缺少 id 字段（或使用 PUT /api/daily-picks/:id）');
  return putById(req, { params: { id } });
}

/** DELETE /api/daily-picks?id=xxx — 删除（id 走 query 或请求体） */
export async function DELETE(req: NextRequest) {
  let id = req.nextUrl.searchParams.get('id');
  if (!id) {
    const peek = await parseBody(req.clone());
    id = typeof peek?.id === 'string' && peek.id ? peek.id : null;
  }
  if (!id) return fail('缺少 id（query 参数或请求体 id 字段）');
  return deleteById(req, { params: { id } });
}

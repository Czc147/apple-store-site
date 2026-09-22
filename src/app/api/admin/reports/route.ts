import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { fetchAuthorsByUserIds } from '@/lib/profiles-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const DEFAULT_PAGE_SIZE = 20;

/**
 * GET /api/admin/reports — 举报列表（管理员）
 * 查询参数：status（pending/resolved/dismissed，缺省全部）、page、page_size
 *
 * 一次把帖子摘要与举报人资料带回去：后台列表要显示"谁举报了哪条帖"，
 * 逐行再查会变成 N+1。
 */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get('page_size') ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE),
  );
  const status = url.searchParams.get('status') ?? '';

  const db = supabaseAdmin();
  let query = db
    .from('post_reports')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return fail(error.message, 500);

  const rows = (data ?? []) as Array<{
    id: string;
    post_id: string;
    reporter_id: string;
    reason: string;
    detail: string | null;
    status: string;
    created_at: string;
    handled_at: string | null;
  }>;

  const postIds = Array.from(new Set(rows.map((r) => r.post_id)));
  const posts = new Map<string, { content: string; user_id: string | null }>();
  if (postIds.length > 0) {
    const { data: postRows } = await db
      .from('community_posts')
      .select('id, content, user_id')
      .in('id', postIds);
    for (const p of postRows ?? []) {
      posts.set(p.id as string, {
        content: p.content as string,
        user_id: (p.user_id as string | null) ?? null,
      });
    }
  }

  const authors = await fetchAuthorsByUserIds(
    db,
    rows.map((r) => r.reporter_id),
  );

  return ok({
    items: rows.map((r) => {
      const post = posts.get(r.post_id);
      return {
        ...r,
        post_excerpt: post ? post.content.slice(0, 60) : null,
        post_deleted: !post,
        reporter: authors.get(r.reporter_id) ?? null,
      };
    }),
    total: count ?? 0,
    page,
    page_size: pageSize,
  });
}

/**
 * PUT /api/admin/reports — 处理举报（管理员）
 * 请求体：{ id, status }
 *
 * 只改处理状态，**不在这里删帖** —— 删帖是另一个动作（后台帖子管理里做）。
 * 把两件事混在一个接口里，误点一下就连帖子带举报一起没了。
 */
export async function PUT(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  const status = body?.status;
  if (!id) return fail('缺少 id');
  if (status !== 'resolved' && status !== 'dismissed' && status !== 'pending') {
    return fail('status 必须为 pending / resolved / dismissed');
  }

  const { data, error } = await supabaseAdmin()
    .from('post_reports')
    .update({
      status,
      handled_at: status === 'pending' ? null : new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) return fail(error.message, 500);
  if (!data) return fail('举报不存在', 404);
  return ok(data);
}

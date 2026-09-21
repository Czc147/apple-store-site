import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 所属帖子摘要长度（正文前 40 字，供后台评论列表快速定位来源帖） */
const EXCERPT_LEN = 40;

/** 分页参数解析：page ≥ 1；page_size 1–100（默认 20） */
function parsePagination(search: URLSearchParams) {
  const page = Math.max(1, Number.parseInt(search.get('page') ?? '1', 10) || 1);
  const rawSize = Number.parseInt(search.get('page_size') ?? '20', 10);
  const pageSize = Number.isFinite(rawSize) ? Math.min(100, Math.max(1, rawSize)) : 20;
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

/** community_comments 行（后台评论列表用） */
interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  user_email: string | null;
  content: string;
  created_at: string;
}

/**
 * GET /api/admin/comments — 社区评论列表（需管理员）
 *
 * 后台「社区管理」的评论区块：全站评论按时间倒序分页浏览，便于运营清理违规内容。
 * 查询参数：
 * - page       页码（≥ 1，默认 1）
 * - page_size  每页条数（1–100，默认 20）
 * - post_id    可选，只看某条帖子下的评论
 *
 * 响应：{ items: [{ ...评论, post_excerpt }], total, page, page_size }
 * post_excerpt 取所属帖子正文前 40 字（本页涉及的 post_id 一次性批量查询，不做 N+1）。
 */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const search = req.nextUrl.searchParams;
  const postId = search.get('post_id')?.trim() || null;
  const { page, pageSize, from, to } = parsePagination(search);

  const db = supabaseAdmin();
  let query = db.from('community_comments').select('*', { count: 'exact' });
  if (postId) query = query.eq('post_id', postId);
  query = query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) return fail(error.message, 500);
  const rows = (data ?? []) as CommentRow[];

  // 所属帖子摘要：只查本页涉及的 post_id（一次 in 查询拼装，避免逐条查询）
  const excerptById = new Map<string, string>();
  const postIds = [...new Set(rows.map((r) => r.post_id))];
  if (postIds.length > 0) {
    const { data: posts, error: postsErr } = await db
      .from('community_posts')
      .select('id, content')
      .in('id', postIds);
    if (postsErr) return fail(postsErr.message, 500);
    for (const p of (posts ?? []) as Array<{ id: string; content: string | null }>) {
      excerptById.set(p.id, (p.content ?? '').slice(0, EXCERPT_LEN));
    }
  }

  const items = rows.map((c) => ({
    ...c,
    post_excerpt: excerptById.get(c.post_id) ?? '',
  }));

  return ok({ items, total: count ?? items.length, page, page_size: pageSize });
}

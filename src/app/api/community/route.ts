import type { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/user-auth';
import { checkAdmin } from '@/lib/auth';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 普通帖保留期限（天），到期由懒清理删除；置顶通知不受限 */
const POST_TTL_DAYS = 7;
/** 懒清理至少间隔（毫秒）：每小时最多跑一次 */
const CLEANUP_INTERVAL_MS = 3600 * 1000;
const LIST_LIMIT = 100;
const MAX_POST_LEN = 2000;
const MAX_COMMENT_LEN = 1000;

/** 社区 posts 懒清理：删除 7 天前且非置顶的帖子（评论/点赞随外键级联删除） */
async function maybeCleanup() {
  const supabase = supabaseAdmin();
  const { data: row } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'community_last_cleanup')
    .maybeSingle();

  const last = Number(row?.value ?? 0);
  if (Number.isFinite(last) && Date.now() - last < CLEANUP_INTERVAL_MS) return;

  const cutoff = new Date(Date.now() - POST_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  await supabase
    .from('community_posts')
    .delete()
    .eq('is_pinned', false)
    .lt('created_at', cutoff);
  await supabase
    .from('app_settings')
    .upsert({ key: 'community_last_cleanup', value: String(Date.now()) });
}

/**
 * GET /api/community — 帖子列表（公开读取，置顶在前，时间倒序）
 * 每帖附 comment_count / like_count / liked_by_me（当前用户是否已赞）。
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  await maybeCleanup();

  const supabase = supabaseAdmin();
  const { data: posts, error } = await supabase
    .from('community_posts')
    .select(
      '*, comments:community_comments(count), likes:community_post_likes(count)',
    )
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) return fail(error.message, 500);

  const list = (posts ?? []) as Array<Record<string, unknown>>;
  const ids = list.map((p) => p.id as string).filter(Boolean);

  // 当前用户是否已赞（未登录 = 全部没有）
  let likedIds = new Set<string>();
  const user = await getRequestUser(req);
  if (user && ids.length > 0) {
    const { data: liked } = await supabase
      .from('community_post_likes')
      .select('post_id')
      .in('post_id', ids)
      .eq('user_id', user.id);
    likedIds = new Set((liked ?? []).map((l) => l.post_id as string));
  }

  const shaped = list.map((p) => ({
    id: p.id,
    user_id: p.user_id,
    user_email: p.user_email,
    content: p.content,
    is_pinned: Boolean(p.is_pinned),
    created_at: p.created_at,
    comment_count: Array.isArray(p.comments) ? Number(p.comments[0]?.count ?? 0) : 0,
    like_count: Array.isArray(p.likes) ? Number(p.likes[0]?.count ?? 0) : 0,
    liked_by_me: likedIds.has(p.id as string),
  }));

  return ok({ posts: shaped });
}

/**
 * POST /api/community — 发帖
 * - 普通用户（Bearer）：发布文本帖，is_pinned 恒 false。
 * - 管理员（cookie）：可发布置顶通知（is_pinned 默认 true）。
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) return fail('内容不能为空');
  if (content.length > MAX_POST_LEN) return fail('内容过长');

  if (!checkAdmin(req)) {
    const user = await getRequestUser(req);
    if (!user) return fail('请先登录', 401);
    const { data, error } = await supabaseAdmin()
      .from('community_posts')
      .insert({ user_id: user.id, user_email: user.email, content })
      .select()
      .single();
    if (error) return fail(error.message, 500);
    return ok(data, 201);
  }

  const isPinned = body.is_pinned === undefined ? true : Boolean(body.is_pinned);
  const { data, error } = await supabaseAdmin()
    .from('community_posts')
    .insert({ user_id: null, user_email: null, content, is_pinned: isPinned })
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok(data, 201);
}

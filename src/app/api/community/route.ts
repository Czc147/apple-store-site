import type { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/user-auth';
import { checkAdmin } from '@/lib/auth';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { fetchAuthorsByUserIds } from '@/lib/profiles-server';
import { OFFICIAL_AUTHOR } from '@/lib/official-author';

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

/** 进程内快速跳过：同一热实例短期内重复 GET 不必每次都查 app_settings 判断 */
let lastCleanupCheckAt = 0;

/** 社区 posts 懒清理：删除 7 天前且非置顶的帖子（评论/点赞随外键级联删除） */
async function maybeCleanup() {
  if (Date.now() - lastCleanupCheckAt < CLEANUP_INTERVAL_MS) return;

  const supabase = supabaseAdmin();
  const { data: row } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'community_last_cleanup')
    .maybeSingle();

  const last = Number(row?.value ?? 0);
  if (Number.isFinite(last) && Date.now() - last < CLEANUP_INTERVAL_MS) {
    lastCleanupCheckAt = Date.now();
    return;
  }
  lastCleanupCheckAt = Date.now();

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

  // 当前用户是否已赞 / 已收藏（未登录 = 全部没有）
  let likedIds = new Set<string>();
  let bookmarkedIds = new Set<string>();
  const user = await getRequestUser(req);
  if (user && ids.length > 0) {
    // 两次查询互不依赖，并发省一次往返
    const [{ data: liked }, { data: saved }] = await Promise.all([
      supabase
        .from('community_post_likes')
        .select('post_id')
        .in('post_id', ids)
        .eq('user_id', user.id),
      supabase
        .from('bookmark_entries')
        .select('post_id')
        .in('post_id', ids)
        .eq('user_id', user.id),
    ]);
    likedIds = new Set((liked ?? []).map((l) => l.post_id as string));
    bookmarkedIds = new Set(
      (saved ?? [])
        .map((b) => b.post_id as string | null)
        .filter((id): id is string => Boolean(id)),
    );
  }

  const authors = await fetchAuthorsByUserIds(
    supabase,
    list.map((p) => p.user_id as string).filter(Boolean),
  );

  const shaped = list.map((p) => ({
    id: p.id,
    user_id: p.user_id,
    user_email: p.user_email,
    author: p.user_id
      ? authors.get(p.user_id as string) ?? null
      : p.is_pinned
        ? OFFICIAL_AUTHOR
        : null,
    content: p.content,
    // 配图（迁移 024）：老帖子没有该列为 null，统一成空数组省得前端到处判空
    images: Array.isArray(p.images) ? (p.images as string[]) : [],
    is_pinned: Boolean(p.is_pinned),
    created_at: p.created_at,
    comment_count: Array.isArray(p.comments) ? Number(p.comments[0]?.count ?? 0) : 0,
    like_count: Array.isArray(p.likes) ? Number(p.likes[0]?.count ?? 0) : 0,
    liked_by_me: likedIds.has(p.id as string),
    bookmarked_by_me: bookmarkedIds.has(p.id as string),
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
  if (content.length > MAX_POST_LEN) return fail('内容过长');

  const images = parseImages(body.images);
  if (!images.ok) return fail(images.error);

  // 纯图帖是合法的（发张图不用硬凑文案），但不能文字和图都空
  if (!content && images.value.length === 0) {
    return fail('内容不能为空');
  }

  if (!checkAdmin(req)) {
    const user = await getRequestUser(req);
    if (!user) return fail('请先登录', 401);
    const { data, error } = await supabaseAdmin()
      .from('community_posts')
      .insert({
        user_id: user.id,
        user_email: user.email,
        content,
        images: images.value.length > 0 ? images.value : null,
      })
      .select()
      .single();
    if (error) return fail(error.message, 500);
    return ok(data, 201);
  }

  const isPinned = body.is_pinned === undefined ? true : Boolean(body.is_pinned);
  const { data, error } = await supabaseAdmin()
    .from('community_posts')
    .insert({
      user_id: null,
      user_email: null,
      content,
      images: images.value.length > 0 ? images.value : null,
      is_pinned: isPinned,
    })
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok(data, 201);
}

/** 帖子配图上限（与迁移 024 的 check 约束一致） */
const MAX_IMAGES = 9;

/**
 * 解析帖子配图。
 * **只接受本仓 storage 的公开直链** —— 否则用户可以塞任意站外地址：
 * 轻则 next/image 的 remotePatterns 不放行导致整页渲染失败，
 * 重则把别人的图床当免费 CDN，甚至用帖子诱导其他用户访问站外地址。
 */
function parseImages(
  raw: unknown,
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'images 必须是数组' };
  if (raw.length > MAX_IMAGES) {
    return { ok: false, error: `最多上传 ${MAX_IMAGES} 张图片` };
  }

  let host = '';
  try {
    host = new URL(process.env.SUPABASE_URL ?? '').host;
  } catch {
    host = '';
  }

  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      return { ok: false, error: 'images 元素必须是字符串' };
    }
    const url = item.trim();
    if (!url) continue;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: '图片地址不合法' };
    }
    const isOurStorage =
      parsed.protocol === 'https:' &&
      (!host || parsed.host === host) &&
      parsed.pathname.startsWith('/storage/v1/object/public/');
    if (!isOurStorage) {
      return { ok: false, error: '只能使用本站上传的图片' };
    }
    out.push(url);
  }
  return { ok: true, value: out };
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { fetchAuthorsByUserIds } from '@/lib/profiles-server';
import { OFFICIAL_AUTHOR } from '@/lib/official-author';
import type { BookmarkEntry } from '@/lib/community';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const MAX_NOTE_LEN = 500;
const PAGE_SIZE = 200;

/**
 * GET /api/bookmarks — 我的收藏流（需登录）
 *
 * 收藏的帖子会连同正文/配图/作者一起带回来，**不让前端逐条再拉一次帖子**：
 * 收藏流就是这个人在「对话」里的一条会话，打开时要一次画完，
 * N 条收藏发 N 个请求会让那一屏一闪一闪地出内容。
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const db = supabaseAdmin();
  const { data: entries, error } = await db
    .from('bookmark_entries')
    .select('id, post_id, content, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(PAGE_SIZE);
  if (error) return fail(error.message, 500);

  const postIds = (entries ?? [])
    .map((e) => e.post_id as string | null)
    .filter((id): id is string => Boolean(id));

  const postById = new Map<
    string,
    { content: string; images: string[] | null; created_at: string; is_pinned: boolean; user_id: string | null }
  >();
  if (postIds.length > 0) {
    const { data: posts } = await db
      .from('community_posts')
      .select('id, content, images, created_at, is_pinned, user_id')
      .in('id', postIds);
    for (const p of posts ?? []) {
      postById.set(p.id as string, {
        content: p.content as string,
        images: (p.images as string[] | null) ?? null,
        created_at: p.created_at as string,
        is_pinned: Boolean(p.is_pinned),
        user_id: (p.user_id as string | null) ?? null,
      });
    }
  }

  const authors = await fetchAuthorsByUserIds(
    db,
    Array.from(postById.values())
      .map((p) => p.user_id)
      .filter((id): id is string => Boolean(id)),
  );

  const shaped: BookmarkEntry[] = (entries ?? []).map((e) => {
    const postId = e.post_id as string | null;
    if (!postId) {
      return {
        id: e.id as string,
        kind: 'note',
        content: e.content as string,
        created_at: e.created_at as string,
        post: null,
      };
    }
    const p = postById.get(postId);
    return {
      id: e.id as string,
      kind: 'post',
      content: e.content as string,
      created_at: e.created_at as string,
      // 原帖被删：post 为 null，前端渲染成「原帖已删除」而不是让整条消失
      post: p
        ? {
            id: postId,
            content: p.content,
            images: p.images ?? [],
            created_at: p.created_at,
            is_pinned: p.is_pinned,
            author: p.user_id
              ? authors.get(p.user_id) ?? null
              : p.is_pinned
                ? {
                    display_name: OFFICIAL_AUTHOR.display_name,
                    avatar_key: OFFICIAL_AUTHOR.avatar_key,
                    avatar_url: OFFICIAL_AUTHOR.avatar_url,
                  }
                : null,
          }
        : null,
    };
  });

  return ok({ entries: shaped });
}

/**
 * POST /api/bookmarks — 在「我的收藏」里给自己写一句备注（需登录）
 * 请求体：{ content }
 *
 * 这就是「和自己对话」的输入框：写下的东西不挂任何帖子，
 * 与收藏的帖子按时间排在同一条流里。
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);
  if (!rateLimit('bookmark-note', getClientIp(req), 40, 60_000)) {
    return fail('操作过于频繁，请稍后再试', 429);
  }

  const body = await parseBody(req);
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!content) return fail('内容不能为空');
  if (content.length > MAX_NOTE_LEN) {
    return fail(`备注不能超过 ${MAX_NOTE_LEN} 字`);
  }

  const { data, error } = await supabaseAdmin()
    .from('bookmark_entries')
    .insert({ user_id: user.id, post_id: null, content })
    .select('id, content, created_at')
    .single();
  if (error) return fail(error.message, 500);

  return ok(
    {
      id: data.id,
      kind: 'note',
      content: data.content,
      created_at: data.created_at,
      post: null,
    } satisfies BookmarkEntry,
    201,
  );
}

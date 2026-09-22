import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_ROLE_KEY';

interface Ctx {
  params: { id: string };
}

/**
 * POST /api/community/posts/:id/bookmark — 收藏 / 取消收藏（需登录）
 *
 * 与点赞同一套模式：按 (user_id, post_id) 查在不在，在就删、不在就插，
 * 返回切换后的状态由服务端说了算。
 *
 * 收藏的帖子会出现在「对话」板块置顶的「我的收藏」里（迁移 027），
 * 所以这里插的是 bookmark_entries 里 post_id 非空的那种条目。
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const db = supabaseAdmin();
  const postId = params.id;

  // 帖子必须存在，否则会收藏出一个永远渲染"原帖已删除"的空条目
  const { data: post } = await db
    .from('community_posts')
    .select('id')
    .eq('id', postId)
    .maybeSingle();
  if (!post) return fail('帖子不存在', 404);

  const { data: existing } = await db
    .from('bookmark_entries')
    .select('id')
    .eq('user_id', user.id)
    .eq('post_id', postId)
    .maybeSingle();

  if (existing) {
    const { error } = await db
      .from('bookmark_entries')
      .delete()
      .eq('id', existing.id);
    if (error) return fail(error.message, 500);
    return ok({ bookmarked: false });
  }

  const { error } = await db
    .from('bookmark_entries')
    .insert({ user_id: user.id, post_id: postId });
  if (error) {
    // 并发双击时唯一索引会拦一下，此时按"已收藏"返回而不是报错
    if (error.code === '23505') return ok({ bookmarked: true });
    return fail(error.message, 500);
  }
  return ok({ bookmarked: true }, 201);
}

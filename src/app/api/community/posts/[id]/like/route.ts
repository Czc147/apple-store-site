import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getRequestUser } from '@/lib/user-auth';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 权威点赞数：切换后按 post_id 重数，作为前端兜底（防止乐观 ±1 与真实值漂移） */
async function countLikes(supabase: SupabaseClient, postId: string): Promise<number> {
  const { count, error } = await supabase
    .from('community_post_likes')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId);
  if (error) return 0;
  return count ?? 0;
}

/** POST /api/community/posts/[id]/like — 点赞/取消赞（需登录，切换式） */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const postId = params.id;
  const supabase = supabaseAdmin();

  const { data: existing } = await supabase
    .from('community_post_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('community_post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', user.id);
    if (error) return fail(error.message, 500);
    return ok({ liked: false, like_count: await countLikes(supabase, postId) });
  }

  const { error } = await supabase
    .from('community_post_likes')
    .insert({ post_id: postId, user_id: user.id });
  if (error) return fail(error.message, 500);
  return ok({ liked: true, like_count: await countLikes(supabase, postId) });
}

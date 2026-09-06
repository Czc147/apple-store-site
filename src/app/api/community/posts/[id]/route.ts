import type { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/user-auth';
import { checkAdmin } from '@/lib/auth';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** PUT /api/community/posts/[id] — 管理员置顶/取消置顶 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);

  const body = await parseBody(req);
  const isPinned = typeof body?.is_pinned === 'boolean' ? body.is_pinned : null;
  if (isPinned === null) return fail('is_pinned 缺失');

  const { data, error } = await supabaseAdmin()
    .from('community_posts')
    .update({ is_pinned: isPinned })
    .eq('id', params.id)
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok(data);
}

/** DELETE /api/community/posts/[id] — 删帖（作者本人 或 管理员） */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const supabase = supabaseAdmin();

  if (!checkAdmin(req)) {
    const user = await getRequestUser(req);
    if (!user) return fail('请先登录', 401);
    const { data: post } = await supabase
      .from('community_posts')
      .select('user_id')
      .eq('id', params.id)
      .maybeSingle();
    if (!post || post.user_id !== user.id) return fail('无权限删除该帖子', 403);
  }

  const { error } = await supabase
    .from('community_posts')
    .delete()
    .eq('id', params.id);
  if (error) return fail(error.message, 500);
  return ok({ deleted: true });
}

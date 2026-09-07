import type { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/user-auth';
import { checkAdmin } from '@/lib/auth';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** DELETE /api/community/posts/[id]/comments/[commentId] — 删除评论（作者本人 或 管理员） */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; commentId: string } },
) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const supabase = supabaseAdmin();

  if (!checkAdmin(req)) {
    const user = await getRequestUser(req);
    if (!user) return fail('请先登录', 401);
    const { data: comment } = await supabase
      .from('community_comments')
      .select('user_id')
      .eq('id', params.commentId)
      .maybeSingle();
    if (!comment) return fail('评论不存在', 404);
    if (comment.user_id !== user.id) return fail('无权限删除该评论', 403);
  }

  const { error } = await supabase
    .from('community_comments')
    .delete()
    .eq('id', params.commentId)
    .eq('post_id', params.id);
  if (error) return fail(error.message, 500);
  return ok({ deleted: true });
}

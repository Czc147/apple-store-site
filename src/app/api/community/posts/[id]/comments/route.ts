import type { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/user-auth';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const MAX_COMMENT_LEN = 1000;

/** GET /api/community/posts/[id]/comments — 某帖评论列表（公开读取） */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const { data, error } = await supabaseAdmin()
    .from('community_comments')
    .select('*')
    .eq('post_id', params.id)
    .order('created_at', { ascending: true });
  if (error) return fail(error.message, 500);
  return ok(data ?? []);
}

/** POST /api/community/posts/[id]/comments — 发表评论（需登录） */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const body = await parseBody(req);
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!content) return fail('内容不能为空');
  if (content.length > MAX_COMMENT_LEN) return fail('评论过长');

  const { data, error } = await supabaseAdmin()
    .from('community_comments')
    .insert({ post_id: params.id, user_id: user.id, user_email: user.email, content })
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok(data, 201);
}

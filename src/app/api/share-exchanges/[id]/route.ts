import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

interface Ctx {
  params: { id: string };
}

/**
 * DELETE /api/share-exchanges/:id — 撤回交换（需登录，仅本人）
 *
 * 只能撤回**还在待处理**的：官方已经通过并派发了权益之后，撤回就等于
 * 白拿一个小单元；已驳回的没有撤回的必要。
 *
 * 这是我在需求书之外补的一条：用户交出去的资源在通过前看不到（接口层不返回），
 * 若还不能撤回，那他在等待期间就完全失去对自己东西的掌控 —— 后台又没人及时处理的话，
 * 资源会无限期挂着。
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const db = supabaseAdmin();
  const { data: row } = await db
    .from('share_exchanges')
    .select('user_id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (!row) return fail('交换不存在', 404);
  if (row.user_id !== user.id) return fail('无权操作该交换', 403);
  if (row.status !== 'pending') {
    return fail('只有待处理的交换可以撤回', 409);
  }

  const { error } = await db
    .from('share_exchanges')
    .update({ status: 'canceled', handled_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) return fail(error.message, 500);
  return ok({ canceled: true });
}

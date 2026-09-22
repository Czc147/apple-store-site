import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/**
 * GET /api/dm/unread — 我的私信未读总数（需登录）
 *
 * 只给「对话」按钮上那个红点用。走和会话列表同一个 RPC 再求和，
 * 而不是直接 `count(*) where recipient_id = me and read_at is null`：
 * **删过聊天记录（迁移 030 的水位线）的那些不能算未读** ——
 * 用裸 count 的话，把会话删了、红点还挂着，正是这次要避免的事。
 * 轮询成本与列表接口相同（一条聚合查询），30s 一次，可接受。
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const { data, error } = await supabaseAdmin().rpc('list_dm_threads', {
    p_user_id: user.id,
  });
  if (error) return fail(error.message, 500);

  const unread = ((data ?? []) as Array<{ unread_count: number | string }>).reduce(
    (sum, t) => sum + Number(t.unread_count ?? 0),
    0,
  );

  return ok({ unread });
}

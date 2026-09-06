import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import type { Notification } from '@/lib/types';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/**
 * GET /api/notifications — 我的通知（登录用户，Bearer 鉴权）
 * 返回全部通知（含已读）按创建时间倒序 + unread_count（角标用）。
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const { data, error } = await supabaseAdmin()
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return fail(error.message, 500);

  const items = (data ?? []) as Notification[];
  const unreadCount = items.filter((n) => !n.read_at).length;

  return ok({ items, unread_count: unreadCount });
}

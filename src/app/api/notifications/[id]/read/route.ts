import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** POST /api/notifications/:id/read — 标记单条通知已读（仅本人） */
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', ctx.params.id)
    .eq('user_id', user.id)
    .select('id, read_at')
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('通知不存在', 404);
  return ok(data);
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

interface RestrictionRow {
  scope: 'login' | 'coupon' | 'referral';
  kind: 'temporary' | 'permanent';
  reason: string;
  starts_at: string;
  ends_at: string | null;
}

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const db = supabaseAdmin();
  const [restrictionResult, profileResult] = await Promise.all([
    db
      .from('account_restrictions')
      .select('scope, kind, reason, starts_at, ends_at')
      .eq('user_id', user.id)
      .eq('active', true)
      .lte('starts_at', new Date().toISOString())
      .or('kind.eq.permanent,ends_at.gt.' + new Date().toISOString()),
    db.from('profiles').select('must_change_password').eq('user_id', user.id).maybeSingle(),
  ]);
  if (restrictionResult.error) return fail(restrictionResult.error.message, 500);

  return ok({
    restrictions: (restrictionResult.data ?? []) as RestrictionRow[],
    must_change_password: Boolean(profileResult.data?.must_change_password),
  });
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);
  const body = await parseBody(req);
  if (body?.action !== 'password_changed') return fail('无效的操作');

  const { error } = await supabaseAdmin()
    .from('profiles')
    .update({ must_change_password: false, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  if (error) return fail(error.message, 500);

  return ok({ must_change_password: false });
}

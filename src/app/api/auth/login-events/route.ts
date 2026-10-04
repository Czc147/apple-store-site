import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { detectLoginDeviceType, detectLoginRegion, hashLoginValue } from '@/lib/login-verification';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);
  if (!rateLimit('login-event', getClientIp(req), 30, 60_000)) {
    return fail('记录过于频繁，请稍后再试', 429);
  }

  const { error } = await supabaseAdmin().from('auth_login_events').insert({
    user_id: user.id,
    device_type: detectLoginDeviceType(req.headers.get('user-agent')),
    region: detectLoginRegion(req),
    ip_hash: hashLoginValue(getClientIp(req)),
  });
  if (error) return fail(`登录记录保存失败：${error.message}`, 500);

  return ok({ recorded: true });
}

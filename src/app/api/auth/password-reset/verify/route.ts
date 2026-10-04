import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  generateTemporaryPassword,
  hashLoginValue,
  isLoginDeviceType,
  regionsMatch,
} from '@/lib/login-verification';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';
const GENERIC_FAILURE = '验证未通过，暂时无法自动重置密码';
const LOOKBACK_HOURS = 8760;

interface UserLookupRow {
  id: string;
  email: string | null;
}

interface LoginEventRow {
  device_type: 'ios' | 'android' | 'windows' | 'macos' | 'other';
  region: string;
}

async function tooManyRecentAttempts(
  db: ReturnType<typeof supabaseAdmin>,
  emailHash: string,
  ipHash: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ count: emailCount }, { count: ipCount }] = await Promise.all([
    db
      .from('password_reset_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('email_hash', emailHash)
      .gte('created_at', since),
    db
      .from('password_reset_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', since),
  ]);
  return (emailCount ?? 0) >= 3 || (ipCount ?? 0) >= 3;
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  if (!rateLimit('password-reset-bot', getClientIp(req), 10, 60_000)) {
    return fail('操作过于频繁，请稍后再试', 429);
  }

  const body = await parseBody(req);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const deviceType = body?.device_type;
  const region = typeof body?.region === 'string' ? body.region.trim() : '';
  if (!email || !isLoginDeviceType(deviceType) || !region) {
    return fail('请完整输入账号、常用设备类型和登录地区', 400);
  }

  const db = supabaseAdmin();
  const emailHash = hashLoginValue(email);
  const ipHash = hashLoginValue(getClientIp(req));
  if (await tooManyRecentAttempts(db, emailHash, ipHash)) {
    return fail('今日尝试次数已用完，请 24 小时后再试', 429);
  }

  const { data: lookup } = await db.rpc('admin_find_user_by_email', { p_email: email });
  const user = Array.isArray(lookup) ? (lookup[0] as UserLookupRow | undefined) : undefined;

  const finishFailure = async () => {
    await db.from('password_reset_attempts').insert({ email_hash: emailHash, ip_hash: ipHash });
    return fail(GENERIC_FAILURE, 403);
  };

  if (!user?.id) return finishFailure();

  const { data: events } = await db
    .from('auth_login_events')
    .select('device_type, region')
    .eq('user_id', user.id)
    .gte('created_at', new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20);

  const loginEvents = (events ?? []) as LoginEventRow[];
  const deviceMatched = loginEvents.some((event) => event.device_type === deviceType);
  const regionMatched = loginEvents.some((event) => regionsMatch(event.region, region));
  if (!deviceMatched || !regionMatched) return finishFailure();

  const temporaryPassword = generateTemporaryPassword();
  const { error: updateError } = await db.auth.admin.updateUserById(user.id, {
    password: temporaryPassword,
  });
  if (updateError) return fail(GENERIC_FAILURE, 500);

  const { data: currentProfile } = await db
    .from('profiles')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  const profileUpdate = currentProfile
    ? db
        .from('profiles')
        .update({ must_change_password: true, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
    : db.from('profiles').insert({
        user_id: user.id,
        display_name: email.split('@')[0]?.trim() || '用户',
        avatar_key: 'aurora',
        must_change_password: true,
      });
  const { error: profileError } = await profileUpdate;
  if (profileError) return fail(`密码已重置，但安全标记写入失败：${profileError.message}`, 500);

  await Promise.all([
    db
      .from('password_reset_attempts')
      .insert({ email_hash: emailHash, ip_hash: ipHash, success: true }),
    db.from('admin_audit_logs').insert({
      target_user_id: user.id,
      action: 'password_reset_bot',
      reason: '客服机器人自动验证通过',
      after_state: { method: 'device_region' },
    }),
  ]);

  return ok({
    temporary_password: temporaryPassword,
    message: '临时密码已生成，下次登录后请立即修改。',
  });
}

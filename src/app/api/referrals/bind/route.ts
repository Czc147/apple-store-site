import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { claimFingerprint } from '@/lib/claim-fingerprint';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';
const CODE_PATTERN = /^[A-Z0-9-]{6,32}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNUP_WINDOW_MS = 15 * 60 * 1000;

function friendlyError(message: string): string {
  if (message.includes('REFERRAL_DISABLED')) return '推广计划暂未开放';
  if (message.includes('REFERRAL_CODE_NOT_FOUND')) return '推广码不存在或已停用';
  if (message.includes('REFERRAL_SELF_INVITE')) return '不能使用自己的推广码';
  if (message.includes('INVITEE_NOT_FOUND') || message.includes('INVITEE_EMAIL_MISMATCH')) {
    return '注册信息校验失败';
  }
  if (message.includes('REFERRAL_ALREADY_BOUND')) return '该账号已绑定过推广关系';
  if (message.includes('REFERRAL_INVITER_LIMIT')) return '对方推广名额已满';
  if (message.includes('REFERRAL_DEVICE_LIMIT')) return '同设备推广名额已满';
  if (message.includes('REFERRAL_IP_LIMIT')) return '同网络推广名额已满';
  return message;
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  if (!rateLimit('referral-bind', getClientIp(req), 20, 60_000)) {
    return fail('操作过于频繁，请稍后再试', 429);
  }

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const inviteeId = typeof body.invitee_id === 'string' ? body.invitee_id.trim() : '';
  const inviteeEmail = typeof body.invitee_email === 'string' ? body.invitee_email.trim() : '';
  const deviceId = typeof body.device_id === 'string' ? body.device_id.trim().slice(0, 128) : '';

  if (!CODE_PATTERN.test(code)) return fail('推广码格式无效');
  if (!UUID_PATTERN.test(inviteeId)) return fail('注册用户 ID 无效');
  if (!inviteeEmail || inviteeEmail.length > 320) return fail('注册邮箱无效');

  const authUser = await getRequestUser(req);
  if (authUser) {
    if (authUser.id !== inviteeId || authUser.email?.toLowerCase() !== inviteeEmail.toLowerCase()) {
      return fail('注册信息与登录会话不一致', 403);
    }
  } else {
    const { data, error } = await supabaseAdmin().auth.getUser(inviteeId);
    const user = data?.user;
    if (error || !user || user.email?.toLowerCase() !== inviteeEmail.toLowerCase()) {
      return fail('注册信息校验失败', 403);
    }
    if (!user.created_at || Date.now() - Date.parse(user.created_at) > SIGNUP_WINDOW_MS) {
      return fail('仅注册后 15 分钟内可绑定推广关系', 403);
    }
  }

  const db = supabaseAdmin();
  if (authUser) {
    const { data: inviteeRestricted, error: inviteeRestrictionError } = await db.rpc(
      'has_active_account_restriction',
      { p_user_id: authUser.id, p_scope: 'referral' },
    );
    if (inviteeRestrictionError) {
      return fail(`推广权限检查失败：${inviteeRestrictionError.message}`, 500);
    }
    if (inviteeRestricted === true) {
      return fail('当前账号已被限制参与推广奖励', 403);
    }
  }

  const { data: referralCode } = await db
    .from('referral_codes')
    .select('user_id')
    .eq('code', code)
    .maybeSingle();
  if (referralCode) {
    const inviterId = (referralCode as { user_id: string }).user_id;
    const { data: inviterRestricted, error: inviterRestrictionError } = await db.rpc(
      'has_active_account_restriction',
      { p_user_id: inviterId, p_scope: 'referral' },
    );
    if (inviterRestrictionError) {
      return fail(`推广权限检查失败：${inviterRestrictionError.message}`, 500);
    }
    if (inviterRestricted === true) return fail('对方推广奖励权限受限', 403);
  }

  const { ipHash, deviceHash } = claimFingerprint(req, deviceId);
  const { data, error } = await db.rpc('bind_referral_invite', {
    p_code: code,
    p_invitee_id: inviteeId,
    p_invitee_email: inviteeEmail,
    p_ip_hash: ipHash,
    p_device_hash: deviceHash,
  });
  if (error) return fail(friendlyError(error.message), 400);
  return ok(data, 201);
}

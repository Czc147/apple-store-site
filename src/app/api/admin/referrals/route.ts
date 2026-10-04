import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ReferralSettings {
  id: 1;
  enabled: boolean;
  reward_coupon_id: string | null;
  reward_delay_hours: number;
  require_email_verified: boolean;
  require_first_order: boolean;
  min_order_amount: number;
  per_inviter_limit: number;
  per_device_limit: number;
  per_ip_limit: number;
  manual_review: boolean;
  updated_at: string;
}

interface InviteRow {
  id: string;
  inviter_id: string;
  invitee_id: string;
  code: string;
  status: 'registered' | 'review' | 'rewarded' | 'rejected';
  registered_at: string;
  rewarded_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

function boolOf(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function intOf(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function amountOf(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100000 ? parsed : fallback;
}

function friendlyInviteError(message: string): string {
  if (message.includes('INVALID_REFERRAL_STATE')) return '当前邀请状态不允许这个操作';
  if (message.includes('REFERRAL_REWARD_NOT_CONFIGURED')) return '请先配置奖励优惠券';
  if (message.includes('REFERRAL_COUPON_NOT_FOUND')) return '奖励优惠券不存在';
  if (message.includes('REFERRAL_COUPON_DISABLED')) return '奖励优惠券已停用';
  if (message.includes('REFERRAL_COUPON_EXPIRED')) return '奖励优惠券已过期';
  if (message.includes('REFERRAL_COUPON_SOLD_OUT')) return '奖励优惠券已发完';
  if (message.includes('REFERRAL_COUPON_LIMIT')) return '推广人已达该券限领数量';
  return message;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const db = supabaseAdmin();
  const [settingsResult, couponResult, inviteResult, userResult, invitedCount, reviewCount, rewardedCount, rejectedCount] =
    await Promise.all([
      db.from('referral_settings').select('*').eq('id', 1).maybeSingle(),
      db
        .from('coupons')
        .select('id, name, type, value, min_amount, enabled')
        .order('created_at', { ascending: false })
        .limit(200),
      db.from('referral_invites').select('*').order('created_at', { ascending: false }).limit(100),
      db.auth.admin.listUsers({ page: 1, perPage: 500 }),
      db.from('referral_invites').select('id', { count: 'exact', head: true }).neq('status', 'rejected'),
      db.from('referral_invites').select('id', { count: 'exact', head: true }).eq('status', 'review'),
      db.from('referral_invites').select('id', { count: 'exact', head: true }).eq('status', 'rewarded'),
      db.from('referral_invites').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
    ]);

  if (
    settingsResult.error ||
    couponResult.error ||
    inviteResult.error ||
    userResult.error ||
    invitedCount.error ||
    reviewCount.error ||
    rewardedCount.error ||
    rejectedCount.error
  ) {
    return fail('推广计划数据加载失败', 500);
  }

  const settings = (settingsResult.data ?? null) as ReferralSettings | null;
  if (!settings) return fail('推广配置不存在，请先执行 042 迁移', 500);

  const emailById = new Map(
    (userResult.data?.users ?? []).map((user) => [user.id, user.email ?? '未知邮箱']),
  );
  const invites = (inviteResult.data ?? []) as InviteRow[];

  return ok({
    settings,
    coupons: couponResult.data ?? [],
    invites: invites.map((invite) => ({
      ...invite,
      inviter_email: emailById.get(invite.inviter_id) ?? '未知邮箱',
      invitee_email: emailById.get(invite.invitee_id) ?? '未知邮箱',
    })),
    stats: {
      invited: invitedCount.count ?? 0,
      review: reviewCount.count ?? 0,
      rewarded: rewardedCount.count ?? 0,
      rejected: rejectedCount.count ?? 0,
    },
    users_truncated: (userResult.data?.total ?? 0) > 500,
  });
}

export async function PATCH(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');

  const rewardCouponRaw = typeof body.reward_coupon_id === 'string' ? body.reward_coupon_id.trim() : '';
  const rewardCouponId = rewardCouponRaw === '' ? null : rewardCouponRaw;
  if (rewardCouponId && !UUID_PATTERN.test(rewardCouponId)) return fail('奖励优惠券 ID 无效');

  if (rewardCouponId) {
    const { data, error } = await supabaseAdmin()
      .from('coupons')
      .select('id')
      .eq('id', rewardCouponId)
      .maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return fail('奖励优惠券不存在', 404);
  }

  const { data, error } = await supabaseAdmin()
    .from('referral_settings')
    .update({
      enabled: boolOf(body.enabled, true),
      reward_coupon_id: rewardCouponId,
      reward_delay_hours: intOf(body.reward_delay_hours, 0, 720, 72),
      require_email_verified: false,
      require_first_order: boolOf(body.require_first_order, false),
      min_order_amount: amountOf(body.min_order_amount, 0),
      per_inviter_limit: intOf(body.per_inviter_limit, 1, 10000, 20),
      per_device_limit: intOf(body.per_device_limit, 1, 1000, 3),
      per_ip_limit: intOf(body.per_ip_limit, 1, 1000, 5),
      manual_review: boolOf(body.manual_review, false),
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select()
    .single();
  if (error) return fail(`推广配置保存失败：${error.message}`, 500);
  return ok(data);
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');
  const action = typeof body.action === 'string' ? body.action : '';

  if (action === 'run') {
    const { data, error } = await supabaseAdmin().rpc('process_referral_rewards');
    if (error) return fail(`推广奖励执行失败：${error.message}`, 500);
    return ok({ processed: Number(data ?? 0) });
  }

  if (action === 'approve' || action === 'reject') {
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!UUID_PATTERN.test(id)) return fail('邀请 ID 无效');
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : null;
    const { data, error } = await supabaseAdmin().rpc('admin_update_referral_invite', {
      p_id: id,
      p_action: action,
      p_reason: reason,
    });
    if (error) return fail(friendlyInviteError(error.message), 400);
    return ok(data);
  }

  return fail('action 必须为 run / approve / reject');
}

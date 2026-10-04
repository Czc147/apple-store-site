import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

interface ReferralOverview {
  share_text?: string;
  settings?: {
    reward_delay_hours?: number;
    require_first_order?: boolean;
    min_order_amount?: number;
    manual_review?: boolean;
    /** 后台自定义的「当前奖励」文案（迁移 044），原样透传给前台 */
    reward_text?: string | null;
  };
  recent?: Array<{ id: string; rejection_reason?: string | null }>;
}

interface RestrictionRow {
  scope: 'login' | 'coupon' | 'referral';
  kind: 'temporary' | 'permanent';
  reason: string;
  ends_at: string | null;
}

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const db = supabaseAdmin();
  const [restrictionResult] = await Promise.all([
    db
      .from('account_restrictions')
      .select('scope, kind, reason, ends_at')
      .eq('user_id', user.id)
      .eq('scope', 'referral')
      .eq('active', true)
      .maybeSingle(),
  ]);
  if (restrictionResult.error) {
    return fail(`推广权限检查失败：${restrictionResult.error.message}`, 500);
  }
  const restriction = (restrictionResult.data ?? null) as RestrictionRow | null;
  const restrictionActive = Boolean(
    restriction &&
      (restriction.kind === 'permanent' ||
        (restriction.ends_at && Date.parse(restriction.ends_at) > Date.now())),
  );

  const codeResult = await db.rpc('get_or_create_referral_code', { p_user_id: user.id });
  if (codeResult.error) return fail(`推广码生成失败：${codeResult.error.message}`, 500);

  const overviewResult = await db.rpc('get_referral_overview', { p_user_id: user.id });
  if (overviewResult.error) {
    return fail(`推广计划加载失败：${overviewResult.error.message}`, 500);
  }

  const inviteResult = await db
    .from('referral_invites')
    .select('id, rejection_reason')
    .eq('inviter_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);
  if (inviteResult.error) return fail(`推广邀请记录加载失败：${inviteResult.error.message}`, 500);

  const rejectionReasonById = new Map(
    (inviteResult.data ?? []).map((invite) => [invite.id, invite.rejection_reason]),
  );
  const overview = (overviewResult.data ?? {}) as ReferralOverview;

  return ok({
    ...overview,
    restricted: restrictionActive,
    restriction_reason: restrictionActive ? restriction?.reason ?? '推广奖励权限受限' : null,
    recent: (overview.recent ?? []).map((invite) => ({
      ...invite,
      rejection_reason: rejectionReasonById.get(invite.id) ?? null,
    })),
  });
}

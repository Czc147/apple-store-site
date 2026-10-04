import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const ALLOWED_ROLES = ['user', 'staff', 'admin'] as const;
const ALLOWED_STATUSES = ['none', '24h', '7d', '30d', 'permanent'] as const;
const ALLOWED_SCOPES = ['login', 'coupon', 'referral'] as const;

type AccountRole = (typeof ALLOWED_ROLES)[number];
type BanValue = (typeof ALLOWED_STATUSES)[number];
type BanScope = (typeof ALLOWED_SCOPES)[number];

interface RestrictionRow {
  id: string;
  scope: 'login' | 'coupon' | 'referral';
  kind: 'temporary' | 'permanent';
  reason: string;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
}

interface ProfileRow {
  display_name: string | null;
  avatar_key: string | null;
  avatar_url: string | null;
}

interface OrderRow {
  id: string;
  order_no: string;
  total: string | number;
  discount_amount: string | number;
  status: string;
  created_at: string;
}

interface EntitlementRow {
  id: string;
  kind: string;
  subscription_id: string | null;
  expires_at: string | null;
  unlocked_at: string;
}

interface CouponClaimRow {
  id: string;
  code: string;
  claimed_at: string;
  used_at: string | null;
  coupons: { name: string } | { name: string }[] | null;
}

interface AuditRow {
  id: string;
  action: string;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  reason: string | null;
  created_at: string;
}

function roleOf(user: User): AccountRole {
  const role = user.app_metadata?.role;
  return ALLOWED_ROLES.includes(role) ? (role as AccountRole) : 'user';
}

function statusOf(user: User) {
  if (user.banned_until && Date.parse(user.banned_until) > Date.now()) {
    return { status: 'banned', banned_until: user.banned_until };
  }
  return { status: 'active', banned_until: null };
}

function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email ?? null,
    display_name: null,
    role: roleOf(user),
    ...statusOf(user),
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at ?? null,
    confirmed_at: user.confirmed_at ?? user.email_confirmed_at ?? null,
  };
}

function banDuration(value: BanValue) {
  if (value === 'permanent') return '876000h';
  return value;
}

function isScopeValue(value: unknown): value is BanScope {
  return (ALLOWED_SCOPES as readonly string[]).includes(value as string);
}

function activeRestrictions(rows: RestrictionRow[]): RestrictionRow[] {
  const now = Date.now();
  return rows.filter((row) => {
    const started = Date.parse(row.starts_at) <= now;
    const notEnded = row.kind === 'permanent' || (row.ends_at && Date.parse(row.ends_at) > now);
    return row.active && started && Boolean(notEnded);
  });
}

function banEndsAt(value: BanValue): string | null {
  if (value === 'permanent') return null;
  const hours = value === '24h' ? 24 : value === '7d' ? 24 * 7 : 24 * 30;
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

function isBanValue(value: unknown): value is BanValue {
  return (ALLOWED_STATUSES as readonly string[]).includes(value as string);
}

function isRoleValue(value: unknown): value is AccountRole {
  return (ALLOWED_ROLES as readonly string[]).includes(value as string);
}

async function writeAudit(
  db: ReturnType<typeof supabaseAdmin>,
  targetUserId: string,
  action: 'set_status' | 'set_role' | 'set_note',
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  reason: string | null,
) {
  const { error } = await db.from('admin_audit_logs').insert({
    operator: 'admin',
    target_user_id: targetUserId,
    action,
    before_state: before,
    after_state: after,
    reason,
  });
  return error;
}

/** GET /api/admin/users/[id] — 账号详情与关联业务概览 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const userId = params.id;
  const db = supabaseAdmin();
  const { data: authUser, error: userError } = await db.auth.admin.getUserById(userId);
  if (userError || !authUser?.user) return fail('用户不存在', 404);

  const [profileResult, noteResult,
    ordersResult,
    entitlementsResult,
    couponsResult,
    auditResult,
    restrictionResult,
  ] = await Promise.all([
    db
      .from('profiles')
      .select('display_name, avatar_key, avatar_url')
      .eq('user_id', userId)
      .maybeSingle(),
    db
      .from('profiles')
      .select('account_note')
      .eq('user_id', userId)
      .maybeSingle(),
    db
      .from('orders')
      .select('id, order_no, total, discount_amount, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('user_entitlements')
      .select('id, kind, subscription_id, expires_at, unlocked_at')
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: false })
      .limit(20),
    db
      .from('coupon_claims')
      .select('id, code, claimed_at, used_at, coupons(name)')
      .eq('user_id', userId)
      .order('claimed_at', { ascending: false })
      .limit(20),
    db
      .from('admin_audit_logs')
      .select('id, action, before_state, after_state, reason, created_at')
      .eq('target_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
    db
      .from('account_restrictions')
      .select('id, scope, kind, reason, starts_at, ends_at, active')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (
    profileResult.error ||
    ordersResult.error ||
    entitlementsResult.error ||
    couponsResult.error ||
    restrictionResult.error
  ) {
    return fail('账号详情加载失败', 500);
  }

  const profile = (profileResult.data ?? null) as ProfileRow | null;
  const accountNote = noteResult.error
    ? null
    : ((noteResult.data as { account_note: string | null } | null)?.account_note ?? null);
  const orders = (ordersResult.data ?? []) as OrderRow[];
  const entitlements = (entitlementsResult.data ?? []) as EntitlementRow[];
  const subscriptions = entitlements.filter((row) => row.kind === 'subscription');
  const couponClaims = (couponsResult.data ?? []) as CouponClaimRow[];
  const auditLogs = (auditResult.data ?? []) as AuditRow[];
  const restrictions = activeRestrictions((restrictionResult.data ?? []) as RestrictionRow[]);

  const subscriptionIds = Array.from(
    new Set(subscriptions.map((row) => row.subscription_id).filter(Boolean)),
  ) as string[];
  let subscriptionNames = new Map<string, string>();
  if (subscriptionIds.length > 0) {
    const { data: subs } = await db
      .from('subscriptions')
      .select('id, name')
      .in('id', subscriptionIds);
    subscriptionNames = new Map((subs ?? []).map((row) => [row.id as string, row.name as string]));
  }

  return ok({
    user: {
      ...publicUser(authUser.user),
      status: restrictions.length > 0 || statusOf(authUser.user).status === 'banned' ? 'banned' : 'active',
      restrictions,
      display_name: profile?.display_name ?? null,
      avatar_key: profile?.avatar_key ?? null,
      avatar_url: profile?.avatar_url ?? null,
      account_note: accountNote,
    },
    orders: orders.map((row) => ({
      ...row,
      payable: Number(row.total) - Number(row.discount_amount ?? 0),
    })),
    subscriptions: subscriptions.map((row) => ({
      ...row,
      name: subscriptionNames.get(row.subscription_id ?? '') ?? null,
    })),
    coupons: couponClaims.map((row) => ({
      id: row.id,
      code: row.code,
      claimed_at: row.claimed_at,
      used_at: row.used_at,
      name: Array.isArray(row.coupons) ? row.coupons[0]?.name : row.coupons?.name,
    })),
    audit_logs: auditLogs,
    audit_available: !auditResult.error,
  });
}

/** PATCH /api/admin/users/[id] — 状态 / 角色 / 备注（管理员，审计） */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const userId = params.id;
  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');

  const action = body.action;
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : null;
  const db = supabaseAdmin();
  const { data: before, error: beforeError } = await db.auth.admin.getUserById(userId);
  if (beforeError || !before?.user) return fail('用户不存在', 404);

  if (action === 'set_status') {
    const value = body.value;
    if (!isBanValue(value)) return fail('无效的账号状态');
    const scope = body.scope;
    if (!isScopeValue(scope)) return fail('无效的封禁范围');
    if (value !== 'none' && !reason) return fail('封禁原因必填，将写入审计日志');

    const { data: beforeRestrictions } = await db
      .from('account_restrictions')
      .select('id, scope, kind, reason, starts_at, ends_at, active')
      .eq('user_id', userId)
      .eq('scope', scope)
      .eq('active', true);
    const beforeActive = activeRestrictions((beforeRestrictions ?? []) as RestrictionRow[]);

    const now = new Date().toISOString();
    const { error: deactivateError } = await db
      .from('account_restrictions')
      .update({ active: false, ends_at: now, updated_at: now })
      .eq('user_id', userId)
      .eq('scope', scope)
      .eq('active', true);
    if (deactivateError) return fail(deactivateError.message, 500);

    if (value !== 'none') {
      const { error: insertError } = await db.from('account_restrictions').insert({
        user_id: userId,
        scope,
        kind: value === 'permanent' ? 'permanent' : 'temporary',
        reason,
        starts_at: now,
        ends_at: banEndsAt(value),
        active: true,
        created_by: 'admin',
      });
      if (insertError) return fail(insertError.message, 500);
    } else if (scope === 'login' && before.user.banned_until) {
      const { error: legacyBanError } = await db.auth.admin.updateUserById(userId, {
        ban_duration: banDuration(value),
      });
      if (legacyBanError) return fail(legacyBanError.message, 500);
    }

    const { data: afterUser, error: afterUserError } = await db.auth.admin.getUserById(userId);
    if (afterUserError || !afterUser?.user) return fail('封禁已保存，但账号刷新失败', 500);
    const { data: afterRestrictions } = await db
      .from('account_restrictions')
      .select('id, scope, kind, reason, starts_at, ends_at, active')
      .eq('user_id', userId)
      .eq('scope', scope)
      .eq('active', true);
    const afterActive = activeRestrictions((afterRestrictions ?? []) as RestrictionRow[]);

    const beforeState = { scope, restrictions: beforeActive, role: roleOf(before.user) };
    const afterState = { scope, restrictions: afterActive, role: roleOf(afterUser.user) };
    const auditError = await writeAudit(
      db,
      userId,
      'set_status',
      beforeState,
      afterState,
      reason,
    );
    if (auditError) return fail('状态已更新，但审计日志写入失败，请检查迁移 040', 500);
    return ok({ user: { ...publicUser(afterUser.user), restrictions: afterActive } });
  }

  if (action === 'set_role') {
    const value = body.value;
    if (!isRoleValue(value)) return fail('无效的账号角色');
    const appMetadata = { ...(before.user.app_metadata ?? {}), role: value };
    const { data: updated, error } = await db.auth.admin.updateUserById(userId, {
      app_metadata: appMetadata,
    });
    if (error || !updated?.user) return fail(error?.message ?? '角色更新失败', 500);

    const beforeState = { role: roleOf(before.user) };
    const afterState = { role: roleOf(updated.user) };
    const auditError = await writeAudit(db, userId, 'set_role', beforeState, afterState, reason);
    if (auditError) return fail('角色已更新，但审计日志写入失败，请检查迁移 040', 500);
    return ok({ user: { ...publicUser(updated.user) } });
  }

  if (action === 'set_note') {
    if (body.value !== null && typeof body.value !== 'string') {
      return fail('备注必须为字符串或 null');
    }
    const note = body.value === null ? null : (body.value as string).trim().slice(0, 300);
    const { data: currentProfile } = await db
      .from('profiles')
      .select('account_note')
      .eq('user_id', userId)
      .maybeSingle();

    const { error } = await db
      .from('profiles')
      .upsert(
        {
          user_id: userId,
          display_name: before.user.email?.split('@')[0]?.trim() || '用户',
          avatar_key: 'aurora',
          account_note: note,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    if (error) return fail(error.message, 500);

    const auditError = await writeAudit(
      db,
      userId,
      'set_note',
      { note: currentProfile?.account_note ?? null },
      { note },
      reason,
    );
    if (auditError) return fail('备注已更新，但审计日志写入失败，请检查迁移 040', 500);
    return ok({ account_note: note });
  }

  return fail('无效的操作');
}

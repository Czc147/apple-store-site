import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { fetchAuthorsByUserIds } from '@/lib/profiles-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const MAX_USERS = 500;

type AccountStatus = 'active' | 'banned';
type AccountRole = 'user' | 'staff' | 'admin';

interface RestrictionRow {
  id: string;
  user_id: string;
  scope: 'login' | 'coupon' | 'referral';
  kind: 'temporary' | 'permanent';
  reason: string;
  starts_at: string;
  ends_at: string | null;
}

interface ProfileRow {
  display_name: string | null;
  avatar_key: string | null;
  avatar_url: string | null;
}

function roleOf(user: User): AccountRole {
  const role = user.app_metadata?.role;
  return role === 'staff' || role === 'admin' ? role : 'user';
}

function statusOf(user: User): AccountStatus {
  if (user.banned_until && Date.parse(user.banned_until) > Date.now()) return 'banned';
  return 'active';
}

function activeRestrictions(rows: RestrictionRow[]): RestrictionRow[] {
  const now = Date.now();
  return rows.filter((row) => {
    const started = Date.parse(row.starts_at) <= now;
    const notEnded = row.kind === 'permanent' || (row.ends_at && Date.parse(row.ends_at) > now);
    return started && Boolean(notEnded);
  });
}

/**
 * GET /api/admin/users — 注册用户列表（需管理员）
 *
 * 兼容原推送服务返回结构，并增加账号管理所需的筛选字段。
 */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const params = new URL(req.url).searchParams;
  const query = (params.get('query') ?? '').trim().toLowerCase();
  const status = params.get('status') ?? 'all';
  const role = params.get('role') ?? 'all';

  const db = supabaseAdmin();
  const { data, error } = await db.auth.admin.listUsers({
    page: 1,
    perPage: MAX_USERS,
  });
  if (error) return fail(error.message, 500);

  const users = data?.users ?? [];
  const profiles = await fetchAuthorsByUserIds(
    db,
    users.map((user) => user.id),
  );
  const { data: noteRows } = await db
    .from('profiles')
    .select('user_id, account_note')
    .in('user_id', users.map((user) => user.id));
  const userIds = users.map((user) => user.id);
  const { data: restrictionRows, error: restrictionError } = userIds.length
    ? await db
        .from('account_restrictions')
        .select('id, user_id, scope, kind, reason, starts_at, ends_at')
        .eq('active', true)
        .in('user_id', userIds)
    : { data: [], error: null };
  if (restrictionError) return fail(`封禁信息加载失败：${restrictionError.message}`, 500);
  const noteById = new Map(
    (noteRows ?? []).map((row) => [
      (row as { user_id: string }).user_id,
      (row as { account_note: string | null }).account_note,
    ]),
  );

  const restrictionsByUser = new Map<string, RestrictionRow[]>();
  for (const row of (restrictionRows ?? []) as RestrictionRow[]) {
    const list = restrictionsByUser.get(row.user_id) ?? [];
    list.push(row);
    restrictionsByUser.set(row.user_id, list);
  }

  const rows = users
    .map((user) => {
      const profile = profiles.get(user.id) as ProfileRow | undefined;
      const restrictions = activeRestrictions(restrictionsByUser.get(user.id) ?? []);
      return {
        user_id: user.id,
        email: user.email ?? null,
        display_name: profile?.display_name ?? null,
        avatar_key: profile?.avatar_key ?? null,
        avatar_url: profile?.avatar_url ?? null,
        account_note: noteById.get(user.id) ?? null,
        role: roleOf(user),
        status: restrictions.length > 0 ? 'banned' : statusOf(user),
        banned_until: user.banned_until ?? null,
        restrictions,
        last_sign_in_at: user.last_sign_in_at ?? null,
        created_at: user.created_at ?? null,
      };
    })
    .filter((user) => {
      const matchesQuery =
        !query ||
        user.email?.toLowerCase().includes(query) ||
        user.display_name?.toLowerCase().includes(query) ||
        user.user_id.toLowerCase().includes(query);
      const matchesStatus = status === 'all' || user.status === status;
      const matchesRole = role === 'all' || user.role === role;
      return matchesQuery && matchesStatus && matchesRole;
    })
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));

  return ok({
    users: rows,
    total: data?.total ?? rows.length,
    truncated: (data?.total ?? rows.length) > MAX_USERS,
    filters: { query, status, role },
  });
}

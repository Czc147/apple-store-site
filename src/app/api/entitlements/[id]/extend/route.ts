import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

type Ctx = { params: { id: string } };

/** 延长天数上限（防误输超大值） */
const MAX_DAYS = 36500;

/**
 * POST /api/entitlements/:id/extend — 延长用户权益有效期（管理端，HMAC cookie 鉴权）
 *
 * 请求体二选一：
 * - { permanent: true }      → 置为永久有效（expires_at = null）
 * - { days: N }（正整数）     → 在 max(当前时刻, 现到期时间) 基础上叠加 N 天；
 *   已过期权益从当前时刻起算（不会从过去的时间点白送天数）。
 *
 * 已是永久权益时拒绝按天延长（409），避免管理员误以为叠加生效。
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');

  const setPermanent = body.permanent === true;
  let days: number | null = null;
  if (!setPermanent) {
    if (
      typeof body.days !== 'number' ||
      !Number.isInteger(body.days) ||
      body.days < 1 ||
      body.days > MAX_DAYS
    ) {
      return fail(`延长天数必须为 1–${MAX_DAYS} 的整数`);
    }
    days = body.days;
  }

  const db = supabaseAdmin();

  // 先读现值：决定叠加基准（永久权益不接受按天延长）
  const { data: current, error: readErr } = await db
    .from('user_entitlements')
    .select('id, expires_at')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) return fail(readErr.message, 500);
  const row = current as { id: string; expires_at: string | null } | null;
  if (!row) return fail('权益不存在', 404);

  let newExpiresAt: string | null;
  if (setPermanent) {
    newExpiresAt = null;
  } else {
    const expMs = row.expires_at ? Date.parse(row.expires_at) : NaN;
    if (row.expires_at === null || Number.isNaN(expMs)) {
      // 永久权益按天延长会把「永久」降级为有限期，属误操作 → 拒绝
      return fail('该权益已是永久有效，无需按天延长', 409);
    }
    const baseMs = Math.max(Date.now(), expMs);
    newExpiresAt = new Date(baseMs + (days as number) * 86400000).toISOString();
  }

  const { data: updated, error: upErr } = await db
    .from('user_entitlements')
    .update({ expires_at: newExpiresAt })
    .eq('id', params.id)
    .select()
    .maybeSingle();
  if (upErr) return fail(upErr.message, 500);
  if (!updated) return fail('权益不存在', 404);

  return ok(updated);
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { parseCouponInput } from '@/lib/coupons-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/**
 * GET /api/admin/coupons — 券列表（需管理员）
 * 附带所属活动名与领取/使用统计。
 */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('coupons')
    .select('*, activities(id, title, description)')
    .order('created_at', { ascending: false });
  if (error) return fail(error.message, 500);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const ids = rows.map((r) => r.id as string);

  const claimRows: Array<{ coupon_id: string; used_at: string | null; order_id: string | null }> = [];
  if (ids.length > 0) {
    const { data: claims, error: claimErr } = await db
      .from('coupon_claims')
      .select('coupon_id, used_at, order_id')
      .in('coupon_id', ids);
    if (claimErr) return fail(claimErr.message, 500);
    claimRows.push(...((claims ?? []) as typeof claimRows));
  }

  const items = rows.map((r) => {
    const mine = claimRows.filter((c) => c.coupon_id === r.id);
    const act = (Array.isArray(r.activities) ? r.activities[0] : r.activities) as
      | { id: string; title: string | null; description: string | null }
      | null;
    const activityName =
      act?.title?.trim() ||
      act?.description?.split(/\r?\n/).find((l) => l.trim())?.trim() ||
      null;
    return {
      ...r,
      activities: undefined,
      activity_name: activityName,
      claimed_count: mine.length,
      used_count: mine.filter((c) => c.used_at).length,
      locked_count: mine.filter((c) => !c.used_at && c.order_id).length,
    };
  });

  return ok({ items });
}

/**
 * POST /api/admin/coupons — 新建券（需管理员）
 * body: { activity_id, name, type, value, min_amount, valid_from?, valid_to?,
 *         total_qty?, per_user_limit?, enabled? }
 */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = (await parseBody(req)) as Record<string, unknown> | null;
  const parsed = parseCouponInput(body);
  if (!parsed.ok) return fail(parsed.error);
  const input = parsed.value;

  const db = supabaseAdmin();
  const { data: act, error: actErr } = await db
    .from('activities')
    .select('id')
    .eq('id', input.activity_id)
    .maybeSingle();
  if (actErr) return fail(actErr.message, 500);
  if (!act) return fail('所属活动不存在', 404);

  const { data, error } = await db.from('coupons').insert(input).select().single();
  if (error) return fail(error.message, 500);
  return ok(data, 201);
}

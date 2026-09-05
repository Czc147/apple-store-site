import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import {
  DAILY_LOCKED,
  expiryToStatus,
  type DailyAccessStatus,
} from '@/lib/daily-access';
import type { UserEntitlement } from '@/lib/types';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/**
 * GET /api/library — 我的库（登录用户，Bearer 鉴权）
 *
 * 返回：
 * - user：{ id, email }
 * - daily_plan：每日计划权益行（无则 null）
 * - daily_status：每日计划实时状态（unlocked/permanent/expired/expires_at/remaining_days）
 * - contents：content 类权益列表（含商品快照），按获得时间倒序
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const db = supabaseAdmin();
  try {
    const { data, error } = await db
      .from('user_entitlements')
      .select('*')
      .eq('user_id', user.id)
      .order('unlocked_at', { ascending: false });
    if (error) return fail(error.message, 500);

    const ents = (data ?? []) as UserEntitlement[];
    const dailyPlan = ents.find((e) => e.kind === 'daily_plan') ?? null;
    const contents = ents.filter((e) => e.kind === 'content');

    // 每日计划实时状态：以 expires_at 现算（过期即 unlocked=false）
    const dailyStatus: DailyAccessStatus = dailyPlan
      ? expiryToStatus(dailyPlan.expires_at ? Date.parse(dailyPlan.expires_at) : null)
      : DAILY_LOCKED;

    return ok({
      user: { id: user.id, email: user.email },
      daily_plan: dailyPlan,
      daily_status: dailyStatus,
      contents,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : '加载失败', 500);
  }
}

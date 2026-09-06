import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/**
 * POST /api/subscriptions/:id/push — 订阅仓库内容更新，推送给所有已解锁订阅的用户（需管理员）
 *
 * 取 user_entitlements 中 kind='subscription' & subscription_id=:id 的 distinct user_id，
 * 为每位用户插一条通知。返回推送人数。
 */
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const db = supabaseAdmin();
  const subscriptionId = ctx.params.id;

  const { data: sub, error: subErr } = await db
    .from('subscriptions')
    .select('id, name')
    .eq('id', subscriptionId)
    .maybeSingle();
  if (subErr) return fail(subErr.message, 500);
  if (!sub) return fail('订阅不存在', 404);

  const { data: subs, error: entErr } = await db
    .from('user_entitlements')
    .select('user_id')
    .eq('kind', 'subscription')
    .eq('subscription_id', subscriptionId)
    .not('user_id', 'is', null);
  if (entErr) return fail(entErr.message, 500);

  const userIds = [...new Set((subs ?? []).map((r) => r.user_id))];
  if (userIds.length === 0) return ok({ pushed: 0, message: '暂无该订阅的用户' });

  const rows = userIds.map((userId) => ({
    user_id: userId,
    title: '订阅已更新',
    body: `「${sub.name}」有新内容已上架，欢迎到「我的库」查看`,
    payload: { ref_type: 'subscription', subscription_id: subscriptionId, url: '/library' },
  }));

  const { error } = await db.from('notifications').insert(rows);
  if (error) return fail(error.message, 500);

  return ok({ pushed: userIds.length });
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { expireStale, syncStatus } from '@/lib/group-buy-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

interface Ctx {
  params: { id: string };
}

/**
 * POST /api/group-buys/:id — 加入拼单（需登录）
 *
 * 三道闸：团还在进行中（不是 full/expired/closed）、没满员、你没在里面。
 * 满员判定用**实际成员数**而不是 status —— status 是懒同步的，
 * 并发下两个请求可能同时读到 open，靠成员数才是准的。
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);
  if (!rateLimit('group-buy-join', getClientIp(req), 30, 60_000)) {
    return fail('操作过于频繁，请稍后再试', 429);
  }

  const db = supabaseAdmin();
  await expireStale(db);

  const { data: gb } = await db
    .from('group_buys')
    .select('id, status, target_count, initiator_id, expires_at')
    .eq('id', params.id)
    .maybeSingle();
  if (!gb) return fail('拼单不存在', 404);
  if (gb.status === 'expired') return fail('该拼单已过期', 409);
  if (gb.status === 'closed') return fail('该拼单已关闭', 409);

  const { data: mine } = await db
    .from('group_buy_members')
    .select('id')
    .eq('group_buy_id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (mine) return fail('你已经在这个拼单里了', 409);

  const { count } = await db
    .from('group_buy_members')
    .select('id', { count: 'exact', head: true })
    .eq('group_buy_id', params.id);
  if ((count ?? 0) >= (gb.target_count as number)) {
    // 顺手把状态校正过来，省得下一个人再撞一次
    await syncStatus(db, params.id);
    return fail('该拼单已满员', 409);
  }

  const { error } = await db
    .from('group_buy_members')
    .insert({ group_buy_id: params.id, user_id: user.id });
  if (error) {
    // 唯一索引兜底：并发双击时只有一次能进
    if (error.code === '23505') return fail('你已经在这个拼单里了', 409);
    return fail(error.message, 500);
  }

  await syncStatus(db, params.id);
  return ok({ joined: true }, 201);
}

/**
 * DELETE /api/group-buys/:id — 退出 / 关闭拼单（需登录）
 *
 * - 发起人退出 → 整个团关闭（他是组织者，他走了这个团就没意义了）
 * - 其他成员退出 → 只移除自己，团继续
 *
 * **已经推送过订单的人不能退**：那笔订单是真实存在的（后台可能在核收款），
 * 退了会造成"订单在、人不在团里"的错位。
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const db = supabaseAdmin();

  const { data: gb } = await db
    .from('group_buys')
    .select('id, initiator_id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (!gb) return fail('拼单不存在', 404);

  const { data: me } = await db
    .from('group_buy_members')
    .select('id, order_id')
    .eq('group_buy_id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!me) return fail('你不在这个拼单里', 403);
  if (me.order_id) return fail('你已经推送过订单，不能退出', 409);

  if (gb.initiator_id === user.id) {
    const { data: pushed } = await db
      .from('group_buy_members')
      .select('id')
      .eq('group_buy_id', params.id)
      .not('order_id', 'is', null)
      .limit(1);
    if (pushed && pushed.length > 0) {
      return fail('已经有人推送订单，不能关闭拼单', 409);
    }
    const { error } = await db
      .from('group_buys')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', params.id);
    if (error) return fail(error.message, 500);
    return ok({ closed: true });
  }

  const { error } = await db.from('group_buy_members').delete().eq('id', me.id);
  if (error) return fail(error.message, 500);
  await syncStatus(db, params.id);
  return ok({ left: true });
}

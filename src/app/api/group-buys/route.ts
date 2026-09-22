import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  DEFAULT_TTL_HOURS,
  expireStale,
  loadSubUnits,
  perPersonPrice,
  type GroupBuyRow,
} from '@/lib/group-buy-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const MIN_COUNT = 2;
const MAX_COUNT = 20;
/** 同时开着太多团没意义，也容易刷屏 */
const MAX_OPEN_PER_USER = 3;

/**
 * GET /api/group-buys — 拼单列表（需登录）
 *
 * 只列进行中与已满员的团（closed/expired 不列，否则列表很快被历史刷满）。
 * 读取时顺手把过期的标掉（懒清理，本项目没有 cron）。
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const db = supabaseAdmin();
  await expireStale(db);

  const { data, error } = await db
    .from('group_buys')
    .select('*')
    .in('status', ['open', 'full'])
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return fail(error.message, 500);

  const rows = (data ?? []) as GroupBuyRow[];
  const subMap = await loadSubUnits(db, rows.map((r) => r.sub_unit_id));

  // 成员：一次查完，按团分组（避免 N+1）
  const ids = rows.map((r) => r.id);
  const membersByGroup = new Map<string, { user_id: string; order_id: string | null }[]>();
  if (ids.length > 0) {
    const { data: members } = await db
      .from('group_buy_members')
      .select('group_buy_id, user_id, order_id')
      .in('group_buy_id', ids);
    for (const m of members ?? []) {
      const list = membersByGroup.get(m.group_buy_id as string) ?? [];
      list.push({
        user_id: m.user_id as string,
        order_id: (m.order_id as string | null) ?? null,
      });
      membersByGroup.set(m.group_buy_id as string, list);
    }
  }

  // 昵称：一次查完
  const allUserIds = Array.from(
    new Set(
      rows
        .flatMap((r) => membersByGroup.get(r.id) ?? [])
        .map((m) => m.user_id)
        .concat(rows.map((r) => r.initiator_id)),
    ),
  );
  const nameById = new Map<string, string>();
  if (allUserIds.length > 0) {
    const { data: profs } = await db
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', allUserIds);
    for (const p of profs ?? []) nameById.set(p.user_id as string, p.display_name as string);
  }

  return ok({
    items: rows.map((r) => {
      const sub = subMap.get(r.sub_unit_id);
      const unitPrice = sub ? Number(sub.price) : 0;
      const members = membersByGroup.get(r.id) ?? [];
      return {
        id: r.id,
        status: r.status,
        target_count: r.target_count,
        member_count: members.length,
        // 每人应付：服务端现算（不落库，见迁移 029）
        per_price: perPersonPrice(unitPrice, r.target_count),
        unit_price: unitPrice,
        product: {
          id: r.sub_unit_id,
          name: sub?.name ?? '（该单元已下架）',
          cover_url: sub?.cover_url ?? null,
        },
        initiator_name: nameById.get(r.initiator_id) ?? '用户',
        members: members.map((m) => ({
          name: nameById.get(m.user_id) ?? '用户',
          pushed: Boolean(m.order_id),
          // 前端要据此判断"我推过没"，不能只看"有没有人推过"
          is_me: m.user_id === user.id,
        })),
        is_member: members.some((m) => m.user_id === user.id),
        is_initiator: r.initiator_id === user.id,
        expires_at: r.expires_at,
        created_at: r.created_at,
      };
    }),
  });
}

/**
 * POST /api/group-buys — 发起拼单（需登录）
 * 请求体：{ sub_unit_id, target_count }
 *
 * 发起人自动占一个位（用户描述的是"选择4个人结算"，含自己）。
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);
  if (!rateLimit('group-buy-create', getClientIp(req), 10, 60_000)) {
    return fail('操作过于频繁，请稍后再试', 429);
  }

  const body = await parseBody(req);
  const subUnitId = typeof body?.sub_unit_id === 'string' ? body.sub_unit_id.trim() : '';
  const rawCount = Number(body?.target_count);
  if (!subUnitId) return fail('请选择小单元');
  if (!Number.isInteger(rawCount) || rawCount < MIN_COUNT || rawCount > MAX_COUNT) {
    return fail(`拼单人数需在 ${MIN_COUNT}–${MAX_COUNT} 之间`);
  }

  const db = supabaseAdmin();

  const { data: sub } = await db
    .from('sub_units')
    .select('id, price')
    .eq('id', subUnitId)
    .maybeSingle();
  if (!sub) return fail('该小单元不存在', 404);
  if (Number(sub.price) <= 0) {
    return fail('该小单元价格异常，暂不支持拼单');
  }

  const { count } = await db
    .from('group_buys')
    .select('id', { count: 'exact', head: true })
    .eq('initiator_id', user.id)
    .eq('status', 'open');
  if ((count ?? 0) >= MAX_OPEN_PER_USER) {
    return fail(`你已有 ${MAX_OPEN_PER_USER} 个进行中的拼单，先等它们结束`, 409);
  }

  const expiresAt = new Date(
    Date.now() + DEFAULT_TTL_HOURS * 3600 * 1000,
  ).toISOString();

  const { data: created, error } = await db
    .from('group_buys')
    .insert({
      initiator_id: user.id,
      sub_unit_id: subUnitId,
      target_count: rawCount,
      expires_at: expiresAt,
    })
    .select('id, status, expires_at')
    .single();
  if (error) return fail(error.message, 500);

  // 发起人占一个位
  const { error: joinErr } = await db
    .from('group_buy_members')
    .insert({ group_buy_id: created.id, user_id: user.id });
  if (joinErr) {
    // 占位失败就把团删掉，别留一个没人参与的空团
    await db.from('group_buys').delete().eq('id', created.id);
    return fail(joinErr.message, 500);
  }

  return ok(created, 201);
}

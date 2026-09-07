import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import {
  DAILY_LOCKED,
  expiryToStatus,
  type DailyAccessStatus,
} from '@/lib/daily-access';
import type { SubscriptionProduct, UserEntitlement } from '@/lib/types';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 签名时长（秒）：订阅仓库内容预览链接 */
const MEDIA_TTL = 3600;

/**
 * GET /api/library — 我的库（登录用户，Bearer 鉴权）
 *
 * 返回：
 * - user：{ id, email }
 * - daily_plan：每日计划权益行（无则 null）
 * - daily_status：每日计划实时状态（unlocked/permanent/expired/expires_at/remaining_days）
 * - contents：content 类权益列表（含商品快照），按获得时间倒序
 * - subscriptions：subscription 类权益列表，每个含订阅名 + 其下商品（现签 1h 媒体链接）
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
    const allSubEnts = ents.filter(
      (e) => e.kind === 'subscription' && e.subscription_id,
    );

    // 「每日计划」类型订阅（全局至多一条）：其订单购买权益与旧 daily_plan 权益
    // 合并现算解锁状态，且不在下方「我的订阅」通用列表中重复展示
    const { data: dailySubRow } = await db
      .from('subscriptions')
      .select('id')
      .eq('type', 'daily_plan')
      .maybeSingle();
    const dailySubId = (dailySubRow as { id: string } | null)?.id ?? null;
    const dailySubEnt = dailySubId
      ? allSubEnts.find((e) => e.subscription_id === dailySubId) ?? null
      : null;

    const dailyStatus = computeDailyStatus(dailyPlan, dailySubEnt);

    // 每日计划的订阅权益与其他订阅一样进入通用列表，用同一套「我的订阅」卡片展示；
    // 兼容仅有旧版 daily_plan 腿（无 subscription 腿）的老数据，现场拼一条指向该订阅的权益
    const subEnts =
      dailyPlan && dailySubId && !dailySubEnt
        ? [...allSubEnts, { ...dailyPlan, subscription_id: dailySubId }]
        : allSubEnts;

    const subscriptions = await loadSubscriptions(db, subEnts);

    return ok({
      user: { id: user.id, email: user.email },
      daily_plan: dailyPlan,
      daily_status: dailyStatus,
      contents,
      subscriptions,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : '加载失败', 500);
  }
}

/** 合并两条腿的每日计划权益，取永久优先、否则更晚到期的一条 */
function computeDailyStatus(
  dailyPlan: UserEntitlement | null,
  dailySubEnt: UserEntitlement | null,
): DailyAccessStatus {
  const candidates = [dailyPlan, dailySubEnt].filter(
    (e): e is UserEntitlement => e !== null,
  );
  if (candidates.length === 0) return DAILY_LOCKED;
  if (candidates.some((e) => e.expires_at === null)) return expiryToStatus(null);
  const latestMs = Math.max(...candidates.map((e) => Date.parse(e.expires_at as string)));
  return expiryToStatus(latestMs);
}

/** 组装订阅权益组：订阅名 + 商品列表（现签媒体链接） */
async function loadSubscriptions(
  db: ReturnType<typeof supabaseAdmin>,
  subEnts: UserEntitlement[],
) {
  if (subEnts.length === 0) return [];

  const subIds = subEnts.map((e) => e.subscription_id as string);

  // 订阅名 + 该用户所有订阅的商品：两者互不依赖，并发查询省一次往返
  const [{ data: subs }, { data: products }] = await Promise.all([
    db.from('subscriptions').select('id, name').in('id', subIds),
    db
      .from('subscription_products')
      .select('*')
      .in('subscription_id', subIds)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);
  const nameById = new Map<string, string | null>();
  for (const s of (subs ?? []) as Array<{ id: string; name: string }>) {
    nameById.set(s.id, s.name);
  }

  // 为有 media_path 的商品现签链接
  const withMedia = await Promise.all(
    (products ?? []).map(async (p: SubscriptionProduct) => {
      if (!p.media_path) return { ...p, media_url: null };
      const { data: signed, error: signErr } = await db
        .storage.from('daily')
        .createSignedUrl(p.media_path, MEDIA_TTL);
      return { ...p, media_url: signErr ? null : signed.signedUrl };
    }),
  );
  const productsBySub = new Map<string, SubscriptionProduct[]>();
  for (const item of withMedia) {
    const list = productsBySub.get(item.subscription_id) ?? [];
    list.push(item);
    productsBySub.set(item.subscription_id, list);
  }

  return subEnts.map((ent) => ({
    entitlement: ent,
    name: nameById.get(ent.subscription_id as string) ?? null,
    products: productsBySub.get(ent.subscription_id as string) ?? [],
  }));
}

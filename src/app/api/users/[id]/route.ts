import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { expireStale, loadSubUnits, perPersonPrice } from '@/lib/group-buy-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const POST_LIMIT = 20;
const GROUP_LIMIT = 10;

/** 我与此人的关系（决定主页上显示哪个按钮） */
type Relation =
  | 'me'
  | 'friend'
  | 'outgoing'
  | 'incoming'
  | 'none';

interface Ctx {
  params: { id: string };
}

/**
 * GET /api/users/:id — 个人主页数据（需登录）
 *
 * 返回：资料 + 作品（帖子）+ 他发起的拼单 + 我与他的关系。
 *
 * **刻意不返回收藏**：收藏是用户自己的私人空间（「我的收藏」那条会话），
 * 主页上聚合展示等于把它公开了。别人只能看到公开产出（帖子、拼单）。
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const me = await getRequestUser(req);
  if (!me) return fail('请先登录', 401);

  const userId = params.id;
  const db = supabaseAdmin();

  const { data: profile } = await db
    .from('profiles')
    .select('user_id, display_name, avatar_key, avatar_url')
    .eq('user_id', userId)
    .maybeSingle();

  // 没设过资料的用户也算存在（auth 里有账号就行），不要把主页直接判死
  const isMe = userId === me.id;

  // 关系：一对用户只有一条边，两个方向都要查
  let relation: Relation = isMe ? 'me' : 'none';
  let friendshipId: string | null = null;
  if (!isMe) {
    const { data: rel } = await db
      .from('friendships')
      .select('id, requester_id, status')
      .or(
        `and(requester_id.eq.${me.id},addressee_id.eq.${userId}),` +
          `and(requester_id.eq.${userId},addressee_id.eq.${me.id})`,
      )
      .maybeSingle();
    if (rel) {
      friendshipId = rel.id as string;
      if (rel.status === 'accepted') relation = 'friend';
      else if (rel.status === 'pending') {
        relation = rel.requester_id === me.id ? 'outgoing' : 'incoming';
      }
      // rejected 当作没关系，允许重新申请
    }
  }

  // 作品：他的帖子（含配图）
  const { data: posts } = await db
    .from('community_posts')
    .select('id, content, images, created_at, is_pinned, like_count:community_post_likes(count)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(POST_LIMIT);

  const { count: postCount } = await db
    .from('community_posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  // 他的拼单（还在进行中的）
  await expireStale(db);
  const { data: groups } = await db
    .from('group_buys')
    .select('id, sub_unit_id, target_count, status, expires_at')
    .eq('initiator_id', userId)
    .in('status', ['open', 'full'])
    .order('created_at', { ascending: false })
    .limit(GROUP_LIMIT);

  const subMap = await loadSubUnits(db, (groups ?? []).map((g) => g.sub_unit_id as string));

  const memberCounts = new Map<string, number>();
  if ((groups ?? []).length > 0) {
    const { data: members } = await db
      .from('group_buy_members')
      .select('group_buy_id')
      .in('group_buy_id', (groups ?? []).map((g) => g.id as string));
    for (const m of members ?? []) {
      const k = m.group_buy_id as string;
      memberCounts.set(k, (memberCounts.get(k) ?? 0) + 1);
    }
  }

  return ok({
    profile: {
      user_id: userId,
      display_name: profile?.display_name ?? '用户',
      avatar_key: profile?.avatar_key ?? null,
      avatar_url: profile?.avatar_url ?? null,
    },
    relation,
    friendship_id: friendshipId,
    post_count: postCount ?? 0,
    posts: (posts ?? []).map((p) => ({
      id: p.id,
      content: p.content,
      images: (p.images as string[] | null) ?? [],
      created_at: p.created_at,
      is_pinned: Boolean(p.is_pinned),
      like_count: Array.isArray(p.like_count)
        ? Number((p.like_count as Array<{ count: number }>)[0]?.count ?? 0)
        : 0,
    })),
    group_buys: (groups ?? []).map((g) => {
      const sub = subMap.get(g.sub_unit_id as string);
      const unitPrice = sub ? Number(sub.price) : 0;
      const members = memberCounts.get(g.id as string) ?? 0;
      return {
        id: g.id,
        status: g.status,
        product_name: sub?.name ?? '（已下架）',
        per_price: perPersonPrice(unitPrice, g.target_count as number),
        member_count: members,
        target_count: g.target_count,
        expires_at: g.expires_at,
      };
    }),
  });
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { fetchAuthorsByUserIds, type AuthorInfo } from '@/lib/profiles-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  responded_at: string | null;
}

interface Shaped {
  id: string;
  user_id: string;
  author: AuthorInfo | null;
  created_at: string;
}

/** 把关系行按"对端是谁"整形成前端好用的形状 */
function shape(
  row: FriendshipRow,
  me: string,
  authors: Map<string, AuthorInfo>,
): Shaped {
  const peer = row.requester_id === me ? row.addressee_id : row.requester_id;
  return {
    id: row.id,
    user_id: peer,
    author: authors.get(peer) ?? null,
    created_at: row.created_at,
  };
}

/**
 * GET /api/friends — 我的好友 / 待我处理 / 我发出的（需登录）
 *
 * 一次返回三组：好友列表、收到的申请（要显示"XX 请求加你"）、我发出的申请
 * （显示"等待对方通过"）。分三个接口的话对话板块要并发三次请求，
 * 而这三份数据本来就是同一次查询的三个筛选结果。
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const db = supabaseAdmin();
  // 一对用户只有一条边，所以"我参与的"一次查全（发起的 + 收到的）
  const { data, error } = await db
    .from('friendships')
    .select('*')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
  if (error) return fail(error.message, 500);

  const rows = (data ?? []) as FriendshipRow[];
  const authors = await fetchAuthorsByUserIds(
    db,
    rows.map((r) => (r.requester_id === user.id ? r.addressee_id : r.requester_id)),
  );

  const friends: Shaped[] = [];
  const incoming: Shaped[] = [];
  const outgoing: Shaped[] = [];

  for (const row of rows) {
    const shaped = shape(row, user.id, authors);
    if (row.status === 'accepted') friends.push(shaped);
    else if (row.status === 'pending') {
      // 谁发起决定它出现在哪一侧
      if (row.requester_id === user.id) outgoing.push(shaped);
      else incoming.push(shaped);
    }
    // rejected 不展示：对方拒绝过就当作没发生过，避免反复戳人
  }

  const byTime = (a: Shaped, b: Shaped) => b.created_at.localeCompare(a.created_at);
  return ok({
    friends: friends.sort(byTime),
    incoming: incoming.sort(byTime),
    outgoing: outgoing.sort(byTime),
  });
}

/**
 * POST /api/friends — 发起好友申请（需登录）
 * 请求体：{ user_id }
 *
 * 两种特殊情况：
 * - 对方**也**申请过我 → 直接成为好友（双向意愿不必再互相点一次通过）
 * - 之前被拒过 → 允许重新发起，把那条边翻回 pending
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);
  if (!rateLimit('friend-request', getClientIp(req), 30, 60_000)) {
    return fail('操作过于频繁，请稍后再试', 429);
  }

  const body = await parseBody(req);
  const targetId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
  if (!targetId) return fail('缺少 user_id');
  if (targetId === user.id) return fail('不能加自己为好友');

  const db = supabaseAdmin();

  // 目标必须存在（profiles 里没有就是没这个人/没设置过资料）
  const { data: target } = await db
    .from('profiles')
    .select('user_id')
    .eq('user_id', targetId)
    .maybeSingle();
  if (!target) return fail('该用户不存在', 404);

  // 按表达式唯一索引的口径找这条边：两个方向都要查
  const { data: existing } = await db
    .from('friendships')
    .select('*')
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${targetId}),` +
        `and(requester_id.eq.${targetId},addressee_id.eq.${user.id})`,
    )
    .maybeSingle();

  const row = existing as FriendshipRow | null;

  if (row?.status === 'accepted') return fail('你们已经是好友了', 409);
  if (row?.status === 'pending') {
    if (row.requester_id === user.id) return fail('申请已发出，等待对方通过', 409);
    // 对方先申请、我又点了一次 → 双向意愿，直接成为好友
    const { data, error } = await db
      .from('friendships')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', row.id)
      .select()
      .single();
    if (error) return fail(error.message, 500);
    return ok({ ...data, became_friends: true }, 200);
  }

  if (row) {
    // 被拒过 → 允许重新发起，并把我记为发起方
    const { data, error } = await db
      .from('friendships')
      .update({
        requester_id: user.id,
        addressee_id: targetId,
        status: 'pending',
        responded_at: null,
        created_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select()
      .single();
    if (error) return fail(error.message, 500);
    return ok(data, 201);
  }

  const { data, error } = await db
    .from('friendships')
    .insert({ requester_id: user.id, addressee_id: targetId })
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok(data, 201);
}

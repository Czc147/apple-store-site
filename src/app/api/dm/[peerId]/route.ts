import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { OFFICIAL_PEER_ID, type DmMessage } from '@/lib/dm';
import { isAgentActive } from '@/lib/dm-official';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 单次拉取的消息上限（从最新往回取，够翻很久；再加分页没意义） */
const PAGE_SIZE = 200;

interface Ctx {
  params: { peerId: string };
}

/**
 * GET /api/dm/:peerId — 与某人的整段会话（需登录）
 *
 * 服务端**顺带把对方发来的未读标记为已读**：拉取即阅读是聊天的常识语义，
 * 让前端再发一个"标记已读"请求既多一次往返、又容易在快速切换会话时漏掉。
 * 只标记「对方发给我」的那些，不动我自己发出去的。
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const peerId = params.peerId;
  if (!peerId) return fail('缺少 peerId');

  const db = supabaseAdmin();
  const isOfficialThread = peerId === OFFICIAL_PEER_ID;

  /**
   * 三件互不依赖的事**并行**做：好友校验 / 删除水位线 / 人工接管状态。
   *
   * 原来是串行的（水位线 → 消息 → 接管状态），加上好友校验一共 4 次跨境往返。
   * 这个接口是**轮询**在打的，每省一次往返就是每轮省 ~110ms（本机）/ ~180ms（线上）。
   * 消息查询依赖水位线，所以它必须在后面单独一轮 —— 4 次串行压到 2 轮。
   */
  const [relRes, hiddenRes, agentActive] = await Promise.all([
    isOfficialThread
      ? Promise.resolve(null)
      : db
          .from('friendships')
          .select('status')
          .or(
            `and(requester_id.eq.${user.id},addressee_id.eq.${peerId}),` +
              `and(requester_id.eq.${peerId},addressee_id.eq.${user.id})`,
          )
          .maybeSingle(),
    // 「删除聊天记录」的水位线（迁移 030）：我删过的话，早于它的消息不再返回。
    // 只影响我 —— 对方那边照旧（各删各的）。
    db
      .from('dm_hidden')
      .select('hidden_before')
      .eq('user_id', user.id)
      .eq('peer_id', peerId)
      .maybeSingle(),
    // 与官方对话时才需要（用户端顶部横幅）；跟真人聊天恒为 false
    isOfficialThread ? isAgentActive(db, user.id) : Promise.resolve(false),
  ]);

  // 哨兵 UUID 之外的对端必须是好友，否则私信内容会被任意人拉走
  if (!isOfficialThread) {
    const rel = (relRes as { data: { status: string } | null } | null)?.data;
    if (rel?.status !== 'accepted') return fail('你们还不是好友', 403);
  }

  const hiddenBefore = (hiddenRes.data as { hidden_before?: string } | null)?.hidden_before;

  // 两个方向都取：我发出去的 + 发给我的
  let query = db
    .from('dm_messages')
    .select('id, sender_id, recipient_id, content, created_at, read_at, kind')
    .or(
      `and(sender_id.eq.${user.id},recipient_id.eq.${peerId}),` +
        `and(sender_id.eq.${peerId},recipient_id.eq.${user.id})`,
    );
  if (hiddenBefore) {
    query = query.gt('created_at', hiddenBefore);
  }
  const { data, error } = await query.order('created_at', { ascending: true }).limit(PAGE_SIZE);
  if (error) return fail(error.message, 500);

  // 标记已读（对方发给我的、且还没读的）
  const unreadIds = (data ?? [])
    .filter((m) => m.recipient_id === user.id && m.sender_id === peerId && !m.read_at)
    .map((m) => m.id);
  if (unreadIds.length > 0) {
    await db
      .from('dm_messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds);
  }

  const messages: DmMessage[] = (data ?? []).map((m) => ({
    id: m.id,
    sender_id: m.sender_id,
    recipient_id: m.recipient_id,
    content: m.content,
    created_at: m.created_at,
    read_at: m.read_at,
    mine: m.sender_id === user.id,
    kind: (m.kind as DmMessage['kind']) ?? 'text',
  }));

  // agentActive 已在上面与好友校验/水位线并行取好，直接用（别再查一次）
  return ok({ messages, agent_active: agentActive });
}

/**
 * DELETE /api/dm/:peerId — 删除这段聊天记录（**只对我隐藏**，迁移 030）
 *
 * 语义：把水位线推到现在，我这边这条会话连同历史一起消失；
 * 对方的记录一条不动，他之后再发消息，会话会重新出现在我的列表里
 * （时间戳晚于水位线）—— 这正是「删记录」而不是「拉黑」的语义。
 *
 * 刻意**不校验好友关系**：最需要清掉的历史，恰恰是「已经不是好友了、
 * 但会话还挂在列表里」的那种死会话。
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const peerId = params.peerId;
  if (!peerId) return fail('缺少 peerId');

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin()
    .from('dm_hidden')
    .upsert(
      { user_id: user.id, peer_id: peerId, hidden_before: now, updated_at: now },
      { onConflict: 'user_id,peer_id' },
    );
  if (error) return fail(error.message, 500);

  return ok({ hidden: true });
}

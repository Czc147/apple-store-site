import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { OFFICIAL_PEER_ID } from '@/lib/dm';
import { isAgentActive, setAgentActive } from '@/lib/dm-official';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 单条回复上限（与用户端一致） */
const MAX_MESSAGE_LEN = 1000;

interface Ctx {
  params: { userId: string };
}

/** 会话里的消息形状（后台用，不需要 mine，方向看 sender 即可） */
function shape(row: {
  id: string; sender_id: string; recipient_id: string;
  content: string; created_at: string; kind?: string | null;
}) {
  return {
    id: row.id,
    sender_id: row.sender_id,
    recipient_id: row.recipient_id,
    content: row.content,
    created_at: row.created_at,
    kind: (row.kind as 'text' | 'agent' | 'system') ?? 'text',
    /** true = 客服/官方发的（渲染成左侧），false = 用户发的 */
    from_official: row.sender_id === OFFICIAL_PEER_ID,
  };
}

/**
 * GET /api/admin/messages/:userId — 某用户与官方的完整对话（管理员）
 *
 * 只读，**不标记已读** —— 用户端那套「拉取即已读」是给聊天用的，
 * 站长看后台不该把用户的未读状态清掉（否则用户以为官方已看，红点也没了）。
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const userId = params.userId;
  if (!userId) return fail('缺少 userId');

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('dm_messages')
    .select('id, sender_id, recipient_id, content, created_at, kind')
    .or(
      `and(sender_id.eq.${OFFICIAL_PEER_ID},recipient_id.eq.${userId}),` +
        `and(sender_id.eq.${userId},recipient_id.eq.${OFFICIAL_PEER_ID})`,
    )
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) return fail(error.message, 500);

  const [{ data: profile }, { data: agentRow }] = await Promise.all([
    db.from('profiles').select('user_id, display_name, avatar_key, avatar_url').eq('user_id', userId).maybeSingle(),
    db.from('dm_agent_state').select('active, started_at').eq('user_id', userId).maybeSingle(),
  ]);

  return ok({
    user: {
      user_id: userId,
      display_name: profile?.display_name ?? null,
      avatar_key: profile?.avatar_key ?? null,
      avatar_url: profile?.avatar_url ?? null,
    },
    agent_active: Boolean(agentRow?.active),
    agent_started_at: agentRow?.started_at ?? null,
    messages: (data ?? []).map(shape),
  });
}

/**
 * POST /api/admin/messages/:userId — 以**官方身份**回复（管理员）
 *
 * 这是全站唯一一条能以官方（哨兵 UUID）身份发消息的通道：用户端那条 POST /api/dm
 * 的 sender 永远是"当前登录用户"，站长账号发出去的话用户会看到一个陌生账号。
 *
 * 若当前**没在接管**，先自动接管再发：否则这条人工回复之后，机器人还会继续
 * 冒出来回话（用户刚被"客服已介入"告知有真人，转头又收到套话）。
 * 接管会顺带插一条系统提示，用户端因此能看到"客服已介入"。
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const userId = params.userId;
  if (!userId) return fail('缺少 userId');

  const body = await parseBody(req);
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!content) return fail('回复内容不能为空');
  if (content.length > MAX_MESSAGE_LEN) return fail(`回复不能超过 ${MAX_MESSAGE_LEN} 字`);

  const db = supabaseAdmin();

  const alreadyActive = await isAgentActive(db, userId);
  if (!alreadyActive) {
    const res = await setAgentActive(db, userId, true);
    if (!res.ok) return fail(res.error, 500);
  }

  const { data: inserted, error } = await db
    .from('dm_messages')
    .insert({
      sender_id: OFFICIAL_PEER_ID,
      recipient_id: userId,
      content,
      kind: 'agent',
    })
    .select('id, sender_id, recipient_id, content, created_at, kind')
    .single();
  if (error) return fail(error.message, 500);

  // 站内通知：用户不一定正开在对话页，靠它把"客服回了"通知到（我的库铃铛）
  await db.from('notifications').insert({
    user_id: userId,
    title: '客服已回复',
    body: content.length > 60 ? `${content.slice(0, 60)}…` : content,
    // 落点用广场的 hash：进去就是「对话」板块，官方会话在最上面
    payload: { url: '/community/plaza#dm' },
  });

  return ok({ message: shape(inserted), took_over: !alreadyActive }, 201);
}

/**
 * PUT /api/admin/messages/:userId — 接入 / 结束人工服务（管理员）
 * 请求体：{ active: boolean }
 *
 * 状态翻转时服务端会往对话里插一条系统提示（见 lib/dm-official.ts），
 * 用户端靠轮询消息就能看到「客服已介入 / 本次服务已结束」，不需要额外的状态接口。
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const userId = params.userId;
  if (!userId) return fail('缺少 userId');

  const body = await parseBody(req);
  const active = body?.active === true;

  const res = await setAgentActive(supabaseAdmin(), userId, active);
  if (!res.ok) return fail(res.error, 500);

  return ok({ agent_active: active, changed: res.changed });
}

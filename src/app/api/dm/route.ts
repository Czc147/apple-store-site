import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { fetchAuthorsByUserIds } from '@/lib/profiles-server';
import { getAppSettings } from '@/lib/app-settings';
import { OFFICIAL_PEER_ID, type DmMessage } from '@/lib/dm';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const MAX_MESSAGE_LEN = 1000;

/** 官方自动回复的兜底文案（后台没配时用） */
const FALLBACK_REPLY = '收到你的留言啦，官方会尽快回复你。';

/** 服务端消息行 → 客户端形状（带 mine，省得前端自己比 id） */
function shapeMessage(
  row: {
    id: string;
    sender_id: string;
    recipient_id: string;
    content: string;
    created_at: string;
    read_at: string | null;
  },
  me: string,
): DmMessage {
  return {
    id: row.id,
    sender_id: row.sender_id,
    recipient_id: row.recipient_id,
    content: row.content,
    created_at: row.created_at,
    read_at: row.read_at,
    mine: row.sender_id === me,
  };
}

/**
 * GET /api/dm — 会话列表（需登录）
 * 走 RPC list_dm_threads 按对端聚合出「最后一条 + 未读数」，
 * 不把全部消息拉到应用层分组（聊得越多越慢，且老会话会被分页挤出窗口）。
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const db = supabaseAdmin();
  const { data, error } = await db.rpc('list_dm_threads', { p_user_id: user.id });
  if (error) return fail(error.message, 500);

  const threads = (data ?? []) as Array<{
    peer_id: string;
    is_official: boolean;
    last_content: string;
    last_at: string;
    last_from_me: boolean;
    unread_count: number | string;
  }>;

  const authors = await fetchAuthorsByUserIds(
    db,
    threads.filter((t) => !t.is_official).map((t) => t.peer_id),
  );

  // 我隐藏过聊天记录的对端（迁移 030）。客户端要拿它压掉「好友但没消息」
  // 那条腿 —— 否则删完记录，好友关系还在，那一行会被补回来，看起来像没删掉。
  const { data: hiddenRows } = await db
    .from('dm_hidden')
    .select('peer_id')
    .eq('user_id', user.id);

  return ok({
    threads: threads.map((t) => ({
      ...t,
      unread_count: Number(t.unread_count),
      author: t.is_official ? null : authors.get(t.peer_id) ?? null,
    })),
    hidden_peers: (hiddenRows ?? []).map((r) => r.peer_id as string),
  });
}

/**
 * POST /api/dm — 发消息（需登录）
 * 请求体：{ peer_id, content }
 *
 * 发给官方（peer_id = 哨兵 UUID）时，服务端**立刻插一条自动回复**并一起返回。
 * 让服务端插而不是前端伪造：这条回复要能刷新后仍在、也要能被后台看到，
 * 前端本地塞一条的话刷新就没了。
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);
  if (!rateLimit('dm-send', getClientIp(req), 40, 60_000)) {
    return fail('发送过于频繁，请稍后再试', 429);
  }

  const body = await parseBody(req);
  const peerId = typeof body?.peer_id === 'string' ? body.peer_id.trim() : '';
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!peerId) return fail('缺少 peer_id');
  if (!content) return fail('消息不能为空');
  if (content.length > MAX_MESSAGE_LEN) {
    return fail(`消息不能超过 ${MAX_MESSAGE_LEN} 字`);
  }

  const db = supabaseAdmin();
  const toOfficial = peerId === OFFICIAL_PEER_ID;

  // 发给真人前先确认是好友：否则任何人都能给任意用户发私信
  if (!toOfficial) {
    if (peerId === user.id) return fail('不能给自己发消息');
    const { data: rel } = await db
      .from('friendships')
      .select('status')
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${peerId}),` +
          `and(requester_id.eq.${peerId},addressee_id.eq.${user.id})`,
      )
      .maybeSingle();
    if (rel?.status !== 'accepted') {
      return fail('你们还不是好友，先加好友再聊天', 403);
    }
  }

  const { data: inserted, error } = await db
    .from('dm_messages')
    .insert({ sender_id: user.id, recipient_id: peerId, content })
    .select()
    .single();
  if (error) return fail(error.message, 500);

  let reply: DmMessage | null = null;
  if (toOfficial) {
    const replyText = await pickAutoReply(content);
    const { data: replyRow } = await db
      .from('dm_messages')
      .insert({
        sender_id: OFFICIAL_PEER_ID,
        recipient_id: user.id,
        content: replyText,
      })
      .select()
      .single();
    if (replyRow) reply = shapeMessage(replyRow, user.id);
  }

  return ok({ message: shapeMessage(inserted, user.id), reply }, 201);
}

/**
 * 挑一条自动回复：先按「关键词=回复内容」逐行匹配，命中就用它，
 * 都没命中才用默认文案。
 *
 * 两个键都在后台「全局配置」里改（app_settings 白名单）。
 * 规则格式故意做得极简（一行一条、等号分隔）——用 JSON 的话后台那个单行输入框
 * 根本没法编辑。
 */
async function pickAutoReply(incoming: string): Promise<string> {
  const settings = await getAppSettings();
  const fallback = settings.official_auto_reply?.trim() || FALLBACK_REPLY;
  const rules = settings.official_reply_rules?.trim();
  if (!rules) return fallback;

  const text = incoming.toLowerCase();
  for (const line of rules.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const keyword = trimmed.slice(0, eq).trim().toLowerCase();
    const reply = trimmed.slice(eq + 1).trim();
    if (keyword && reply && text.includes(keyword)) return reply;
  }
  return fallback;
}

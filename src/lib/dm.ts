/**
 * 私信（探究广场 · 对话板块）的共享常量、类型与客户端取数。
 * 只依赖 auth-context 的 getAuthHeaders 调本站 /api/dm。
 */

/**
 * 官方（小机器人）的哨兵 UUID。
 * 与迁移 026 里 `00000000-0000-0000-0000-000000000000` 必须保持一致；
 * 真实 auth 用户不可能是这个值（gen_random_uuid 不会生成全零）。
 */
export const OFFICIAL_PEER_ID = '00000000-0000-0000-0000-000000000000';

/** 会话摘要（服务端 RPC list_dm_threads 的输出） */
export interface DmThread {
  peer_id: string;
  is_official: boolean;
  last_content: string;
  last_at: string;
  last_from_me: boolean;
  unread_count: number;
  /** 对方资料（官方没有 profiles 记录，为 null） */
  author: { display_name: string; avatar_key: string; avatar_url: string | null } | null;
}

export interface DmMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  /** 是不是我发的（服务端按当前用户算好，客户端不用自己比 id） */
  mine: boolean;
  /**
   * 消息种类（迁移 031）：
   * - text   普通消息（含官方**自动**回复）
   * - agent  人工客服发的 → 用户端打「客服」标签
   * - system 系统提示（客服接入/结束）→ 用户端渲染成居中灰字
   */
  kind: 'text' | 'agent' | 'system';
}

type Headers = () => Promise<Record<string, string>>;

/** 好友/申请列表 */
export interface FriendEntry {
  id: string;
  user_id: string;
  author: { display_name: string; avatar_key: string; avatar_url: string | null } | null;
  created_at: string;
}

export interface FriendsResponse {
  friends: FriendEntry[];
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
}

export async function fetchFriends(
  getAuthHeaders: Headers,
): Promise<FriendsResponse | null> {
  try {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) return null;
    const res = await fetch('/api/friends', { headers });
    if (!res.ok) return null;
    return (await res.json()) as FriendsResponse;
  } catch {
    return null;
  }
}

/** 发起好友申请；返回 null 表示失败，字符串为可展示的错误原因 */
export async function requestFriend(
  getAuthHeaders: Headers,
  userId: string,
): Promise<{ ok: true; becameFriends: boolean } | { ok: false; error: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ user_id: userId }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      became_friends?: boolean;
    };
    if (!res.ok) return { ok: false, error: data.error ?? '发送申请失败' };
    return { ok: true, becameFriends: Boolean(data.became_friends) };
  } catch {
    return { ok: false, error: '网络异常，请稍后再试' };
  }
}

/** 同意 / 拒绝好友申请 */
export async function respondFriend(
  getAuthHeaders: Headers,
  friendshipId: string,
  action: 'accept' | 'reject',
): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/friends/${friendshipId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ action }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 删好友 / 撤回申请 */
export async function removeFriend(
  getAuthHeaders: Headers,
  friendshipId: string,
): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/friends/${friendshipId}`, {
      method: 'DELETE',
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 删除这段聊天记录（只对我隐藏，迁移 030）—— 失败时带回服务端的原话 */
export async function hideDmThread(
  getAuthHeaders: Headers,
  peerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/dm/${peerId}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: body?.error ?? `删除失败（${res.status}）` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: '网络异常，请稍后重试' };
  }
}

/**
 * 会话列表（含未读数）+ 我隐藏过记录的对端。
 *
 * `hiddenPeers` 是给「好友但没消息」那种行用的：删掉聊天记录之后，
 * 会话本身没了，可**好友关系还在** —— 不带上这个名单，「没消息的好友」
 * 那条腿会立刻把这一行又补回来，用户看到的就是"删了还在"。
 */
export interface ThreadsResult {
  threads: DmThread[];
  hiddenPeers: string[];
}

export async function fetchThreads(
  getAuthHeaders: Headers,
): Promise<ThreadsResult | null> {
  try {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) return null;
    const res = await fetch('/api/dm', { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { threads?: DmThread[]; hidden_peers?: string[] };
    return {
      threads: Array.isArray(data.threads) ? data.threads : [],
      hiddenPeers: Array.isArray(data.hidden_peers) ? data.hidden_peers : [],
    };
  } catch {
    return null;
  }
}

/**
 * 取某会话的消息结果。
 *
 * 为什么要区分失败原因而不是一律返回 null：会话列表是按**消息记录**聚合的，
 * 好友关系被删掉之后旧会话仍然留在列表里。点进去时取数会 403，
 * 若只返回 null，用户看到的是一个空白会话，还以为是消息丢了 ——
 * 必须能区分出"你们已不是好友"，界面才解释得清楚。
 */
export type FetchMessagesResult =
  | {
      ok: true;
      messages: DmMessage[];
      /** 与官方对话时：是否正被人工接管（迁移 031）→ 界面显示「客服已介入」横幅 */
      agentActive: boolean;
    }
  | { ok: false; reason: 'not-friend' | 'unauthorized' | 'error' };

/** 某会话的消息（服务端同时把这些消息标记为已读） */
export async function fetchMessages(
  getAuthHeaders: Headers,
  peerId: string,
): Promise<FetchMessagesResult> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/dm/${peerId}`, { headers });
    if (res.status === 403) return { ok: false, reason: 'not-friend' };
    if (res.status === 401) return { ok: false, reason: 'unauthorized' };
    if (!res.ok) return { ok: false, reason: 'error' };
    const data = (await res.json()) as { messages: DmMessage[]; agent_active?: boolean };
    return {
      ok: true,
      messages: Array.isArray(data.messages) ? data.messages : [],
      agentActive: Boolean(data.agent_active),
    };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** 发消息；返回服务端落库后的那一条（官方会自动回一条，见路由） */
export type SendMessageResult =
  | { ok: true; mine: DmMessage; reply: DmMessage | null }
  | { ok: false; error: string };

export async function sendMessage(
  getAuthHeaders: Headers,
  peerId: string,
  content: string,
): Promise<SendMessageResult> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/dm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ peer_id: peerId, content }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      message?: DmMessage;
      reply?: DmMessage | null;
      error?: string;
    };
    if (!res.ok || !data.message) {
      // 把服务端的原话带回去（如「你们还不是好友，先加好友再聊天」）——
      // 统一成"发送失败"用户不知道该怎么办
      return { ok: false, error: data.error ?? '发送失败，请稍后再试' };
    }
    return { ok: true, mine: data.message, reply: data.reply ?? null };
  } catch {
    return { ok: false, error: '网络异常，消息未发出' };
  }
}

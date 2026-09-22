import type { supabaseAdmin } from '@/lib/supabase/admin';
import { OFFICIAL_PEER_ID } from '@/lib/dm';

/**
 * 官方留言的人工客服（迁移 031）——服务端共用的一小块。
 *
 * 背景：用户给官方留言后，服务端会立刻插一条**机器人自动回复**。站长要能
 * 「接入」某个用户的会话人工处理，接入期间**暂停自动回复**，处理完点「结束服务」恢复。
 */

export type DmKind = 'text' | 'agent' | 'system';

/**
 * 系统提示的两句文案（用户端渲染成居中灰字，不是气泡）。
 *
 * 接入那句刻意写**短**：用户端顶部已经有一条横幅在说"正在为你处理"，
 * 时间线里再来一句一模一样的长句就是文字打架（实测截图里看着就是重复）。
 * 这里只留一个时间点标记，解释交给横幅。
 * 结束那句反过来要写全 —— 它要回答"接下来谁管我"，横幅这时已经消失了。
 */
export const AGENT_SYSTEM_TEXT = {
  start: '客服已介入',
  end: '本次人工服务已结束，机器人将继续为你应答',
} as const;

type Db = ReturnType<typeof supabaseAdmin>;

/** 该用户与官方的对话是否正被人工接管（接管中就不发自动回复） */
export async function isAgentActive(db: Db, userId: string): Promise<boolean> {
  const { data } = await db
    .from('dm_agent_state')
    .select('active')
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data?.active);
}

/**
 * 接入 / 结束人工服务。
 *
 * 状态翻转时**顺便往对话里插一条系统提示**：用户端靠轮询消息就能立刻看到
 * 「客服已介入」，不用再多一个状态接口，也不会因为用户退出重进而错过。
 * 重复点同一个状态（已经是接管中再点接入）不插提示，免得刷屏。
 */
export async function setAgentActive(
  db: Db,
  userId: string,
  active: boolean,
): Promise<{ ok: true; changed: boolean } | { ok: false; error: string }> {
  const current = await isAgentActive(db, userId);
  const now = new Date().toISOString();

  const { error } = await db.from('dm_agent_state').upsert(
    {
      user_id: userId,
      active,
      updated_at: now,
      // 首次置 true 才记开始时间；结束不改它（留作"这次服务什么时候开始的"）
      ...(active ? { started_at: now } : {}),
    },
    { onConflict: 'user_id' },
  );
  if (error) return { ok: false, error: error.message };

  if (current === active) return { ok: true, changed: false };

  const { error: msgErr } = await db.from('dm_messages').insert({
    sender_id: OFFICIAL_PEER_ID,
    recipient_id: userId,
    content: active ? AGENT_SYSTEM_TEXT.start : AGENT_SYSTEM_TEXT.end,
    kind: 'system',
  });
  // 系统提示写失败不算致命（状态已经生效），但要说出来，免得用户端"没反应"查不出原因
  if (msgErr) return { ok: false, error: `状态已更新，但系统提示写入失败：${msgErr.message}` };

  return { ok: true, changed: true };
}

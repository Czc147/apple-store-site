import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { OFFICIAL_PEER_ID } from '@/lib/dm';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 官方信箱一次最多扫多少条消息（按时间倒序，够了；再多的历史可以以后加分页） */
const SCAN_LIMIT = 3000;

/** 邮箱分页拉取的上限（每页 1000，最多翻 10 页）——防止用户量大了把这个接口拖死 */
const EMAIL_PAGE = 1000;
const EMAIL_MAX_PAGES = 10;

/**
 * 取一批用户的邮箱。**profiles 表里没有邮箱**（只有昵称/头像），
 * 邮箱只在 auth.users 里，只能走 admin API 翻页拿全量再筛。
 * 用户量小的时候一次就够；量大了也不会失控（有上限），拿不到的邮箱显示为空。
 */
async function fetchEmailsByIds(ids: Set<string>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.size === 0) return map;
  const admin = supabaseAdmin();
  for (let page = 1; page <= EMAIL_MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: EMAIL_PAGE });
    if (error) break;
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.id && ids.has(u.id) && u.email) map.set(u.id, u.email);
    }
    if (users.length < EMAIL_PAGE) break;
    if (map.size >= ids.size) break;
  }
  return map;
}

/**
 * GET /api/admin/messages — 官方留言列表（管理员）
 *
 * **按用户聚合**（一条消息一行在后台没法用）：每个跟官方说过的用户占一行，
 * 显示邮箱/昵称、最后一条消息、时间，以及两个状态。
 *
 * ⚠️「待回复」的判定是**「你的最后一条留言之后，有没有人工回复」**，不是
 * 「最后一条是不是官方发的」——后者会被**机器人自动回复**直接判成"已回"：
 * 用户一发消息机器人立刻回一条，于是每个人看起来都处理完了，这个页面就废了。
 * 所以真正要比的是「最后一条用户消息」和「最后一条人工消息（kind='agent'）」谁更晚。
 *
 * 实现上直接扫官方信箱的消息（倒序、有上限）在应用层聚合：
 * 一次查询就能同时拿到「最后一条」「用户最后一条」「人工最后一条」，
 * 比为了三个聚合值去写 RPC 简单得多，且官方信箱的量级远小于全站私信。
 */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('dm_messages')
    .select('sender_id, recipient_id, content, created_at, kind')
    .or(`sender_id.eq.${OFFICIAL_PEER_ID},recipient_id.eq.${OFFICIAL_PEER_ID}`)
    .order('created_at', { ascending: false })
    .limit(SCAN_LIMIT);
  if (error) return fail(error.message, 500);

  // 每个用户只留需要的那几个时间点
  interface Agg {
    peer: string;
    last_content: string;
    last_at: string;
    last_kind: string;
    last_user_at: string | null;
    last_agent_at: string | null;
  }
  const byPeer = new Map<string, Agg>();

  for (const m of data ?? []) {
    const fromOfficial = m.sender_id === OFFICIAL_PEER_ID;
    const peer = (fromOfficial ? m.recipient_id : m.sender_id) as string;
    let a = byPeer.get(peer);
    if (!a) {
      // 倒序扫，第一次遇到的就是这个用户的最新一条
      a = {
        peer,
        last_content: m.content as string,
        last_at: m.created_at as string,
        last_kind: (m.kind as string) ?? 'text',
        last_user_at: null,
        last_agent_at: null,
      };
      byPeer.set(peer, a);
    }
    if (!fromOfficial) {
      if (!a.last_user_at) a.last_user_at = m.created_at as string;
    } else if ((m.kind ?? 'text') === 'agent' && !a.last_agent_at) {
      a.last_agent_at = m.created_at as string;
    }
  }

  const ids = [...byPeer.keys()];
  const idSet = new Set(ids);

  const [{ data: profileRows }, emails, { data: agentRows }] = await Promise.all([
    ids.length
      ? db.from('profiles').select('user_id, display_name, avatar_key, avatar_url').in('user_id', ids)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    fetchEmailsByIds(idSet),
    ids.length
      ? db.from('dm_agent_state').select('user_id, active, started_at').in('user_id', ids)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  const profileById = new Map(
    (profileRows ?? []).map((p) => [p.user_id as string, p as {
      user_id: string; display_name: string | null; avatar_key: string | null; avatar_url: string | null;
    }]),
  );
  const agentById = new Map(
    (agentRows ?? []).map((a) => [a.user_id as string, a as { user_id: string; active: boolean; started_at: string }]),
  );

  const items = [...byPeer.values()].map((a) => {
    const p = profileById.get(a.peer);
    const st = agentById.get(a.peer);
    // 已回 = 人工回复晚于用户最后一条；用户之后没再说话才算处理完
    const replied = Boolean(
      a.last_agent_at && a.last_user_at && Date.parse(a.last_agent_at) > Date.parse(a.last_user_at),
    );
    return {
      user_id: a.peer,
      email: emails.get(a.peer) ?? null,
      display_name: p?.display_name ?? null,
      avatar_key: p?.avatar_key ?? null,
      avatar_url: p?.avatar_url ?? null,
      last_content: a.last_content,
      last_at: a.last_at,
      last_kind: a.last_kind,
      replied,
      agent_active: Boolean(st?.active),
      agent_started_at: st?.started_at ?? null,
    };
  });

  // 待回复排前面，其次按最后消息时间倒序 —— 站长一眼看到"还有谁在等"
  items.sort((x, y) => {
    if (x.replied !== y.replied) return x.replied ? 1 : -1;
    return Date.parse(y.last_at) - Date.parse(x.last_at);
  });

  return ok({
    items,
    waiting_count: items.filter((i) => !i.replied).length,
    agent_count: items.filter((i) => i.agent_active).length,
  });
}

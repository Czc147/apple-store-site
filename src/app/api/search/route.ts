import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { fetchAuthorsByUserIds } from '@/lib/profiles-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 每组最多返回几条（搜索是"快速定位"，不是浏览；多了反而找不到） */
const GROUP_LIMIT = 6;
const MIN_QUERY_LEN = 1;

/**
 * 把用户输入变成安全的 ILIKE 模式。
 * 必须转义 `%` `_` `\` —— 否则用户输入 `%` 就会匹配全部内容，
 * `_` 会变成任意单字符，既费性能又不是他要的结果。
 */
function likePattern(raw: string): string {
  const escaped = raw.replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}

/**
 * GET /api/search?q=... — 全站搜索（需登录，聊天记录只搜自己的）
 *
 * 用户要求能搜：交流的帖子、一起买的拼单、共享的交换、好友、聊天记录。
 * 拼单与共享两个板块还没建，等它们落地后在本文件里各加一段即可
 * （结果对象已经是分组的，前端不用改结构）。
 *
 * 这里额外补了两类用户没点名但「全局搜索」应该有：
 * - **用户**：搜不到人会以为站点没人
 * - **商品**（大/小单元）：搜索是全局入口，搜不到商品最奇怪
 *
 * 隐私边界：聊天记录**只搜当前用户参与的**（sent 或 received），
 * 别人的私信内容不可被搜出来。
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录后再搜索', 401);
  if (!rateLimit('search', getClientIp(req), 60, 60_000)) {
    return fail('搜索过于频繁，请稍后再试', 429);
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < MIN_QUERY_LEN) {
    return ok({ q, posts: [], users: [], products: [], messages: [] });
  }

  const db = supabaseAdmin();
  const like = likePattern(q);

  // 四组互不依赖，并发省往返
  const [postsRes, profilesRes, majorsRes, subsRes, messagesRes] = await Promise.all([
    db
      .from('community_posts')
      .select('id, content, created_at, user_id, is_pinned, images')
      .ilike('content', like)
      .order('created_at', { ascending: false })
      .limit(GROUP_LIMIT),
    db
      .from('profiles')
      .select('user_id, display_name, avatar_key, avatar_url')
      .ilike('display_name', like)
      .limit(GROUP_LIMIT),
    db
      .from('major_units')
      .select('id, name, cover_color')
      .ilike('name', like)
      .limit(GROUP_LIMIT),
    db
      .from('sub_units')
      .select('id, name, price, major_unit_id')
      .ilike('name', like)
      .limit(GROUP_LIMIT),
    // 聊天记录：只搜我参与的（发出去 + 收到的）
    db
      .from('dm_messages')
      .select('id, sender_id, recipient_id, content, created_at')
      .ilike('content', like)
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(GROUP_LIMIT),
  ]);

  // 帖子作者
  const postRows = postsRes.data ?? [];
  const postAuthors = await fetchAuthorsByUserIds(
    db,
    postRows.map((p) => p.user_id as string).filter(Boolean),
  );

  // 聊天记录的对方（官方是哨兵 UUID，没有 profiles 记录）
  const msgRows = messagesRes.data ?? [];
  const peerIds = Array.from(
    new Set(
      msgRows
        .map((m) => (m.sender_id === user.id ? m.recipient_id : m.sender_id))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const peerAuthors = await fetchAuthorsByUserIds(db, peerIds);

  return ok({
    q,
    posts: postRows.map((p) => ({
      id: p.id,
      content: p.content,
      created_at: p.created_at,
      is_pinned: p.is_pinned,
      author: p.user_id ? postAuthors.get(p.user_id as string) ?? null : null,
    })),
    users: (profilesRes.data ?? []).map((u) => ({
      user_id: u.user_id,
      display_name: u.display_name,
      avatar_key: u.avatar_key,
      avatar_url: u.avatar_url,
      is_me: u.user_id === user.id,
    })),
    products: [
      ...(majorsRes.data ?? []).map((m) => ({
        kind: 'major' as const,
        id: m.id,
        name: m.name,
        price: null,
      })),
      ...(subsRes.data ?? []).map((s) => ({
        kind: 'sub' as const,
        id: s.id,
        name: s.name,
        price: s.price === null ? null : Number(s.price),
      })),
    ],
    messages: msgRows.map((m) => {
      const peerId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
      const isOfficial = peerId === '00000000-0000-0000-0000-000000000000';
      return {
        id: m.id,
        peer_id: peerId,
        peer_name: isOfficial
          ? 'Zorvin 官方'
          : peerAuthors.get(peerId as string)?.display_name ?? '好友',
        content: m.content,
        created_at: m.created_at,
        mine: m.sender_id === user.id,
      };
    }),
  });
}

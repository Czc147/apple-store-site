import type { supabaseAdmin } from '@/lib/supabase/admin';

export interface AuthorInfo {
  display_name: string;
  avatar_key: string;
  avatar_url: string | null;
}

/**
 * 批量按 user_id 查资料，供社区帖子/评论展示头像+昵称（实时 join，非快照）。
 * 找不到资料（理论上只有极端边界情况）的 user_id 不会出现在返回的 Map 里，
 * 调用方按 map.get(id) ?? null 处理，前端再 fallback 回邮箱前缀。
 */
export async function fetchAuthorsByUserIds(
  db: ReturnType<typeof supabaseAdmin>,
  userIds: string[],
): Promise<Map<string, AuthorInfo>> {
  const map = new Map<string, AuthorInfo>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return map;

  const { data } = await db
    .from('profiles')
    .select('user_id, display_name, avatar_key, avatar_url')
    .in('user_id', ids);

  for (const row of (data ?? []) as Array<{
    user_id: string;
    display_name: string;
    avatar_key: string;
    avatar_url: string | null;
  }>) {
    map.set(row.user_id, {
      display_name: row.display_name,
      avatar_key: row.avatar_key,
      avatar_url: row.avatar_url,
    });
  }
  return map;
}

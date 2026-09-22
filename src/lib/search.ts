/**
 * 全站搜索 · 客户端取数（'use client' 组件使用）。
 */

export interface SearchPost {
  id: string;
  content: string;
  created_at: string;
  is_pinned: boolean;
  author: { display_name: string; avatar_key: string; avatar_url: string | null } | null;
}

export interface SearchUser {
  user_id: string;
  display_name: string;
  avatar_key: string;
  avatar_url: string | null;
  is_me: boolean;
}

export interface SearchProduct {
  kind: 'major' | 'sub';
  id: string;
  name: string;
  price: number | null;
}

export interface SearchMessage {
  id: string;
  peer_id: string;
  peer_name: string;
  content: string;
  created_at: string;
  mine: boolean;
}

export interface SearchResults {
  q: string;
  posts: SearchPost[];
  users: SearchUser[];
  products: SearchProduct[];
  messages: SearchMessage[];
}

export const EMPTY_RESULTS: SearchResults = {
  q: '',
  posts: [],
  users: [],
  products: [],
  messages: [],
};

export function countResults(r: SearchResults): number {
  return r.posts.length + r.users.length + r.products.length + r.messages.length;
}

type Headers = () => Promise<Record<string, string>>;

/** 搜索；失败返回 null（面板显示"搜索失败"，不伪装成"没结果"） */
export async function search(
  getAuthHeaders: Headers,
  q: string,
  signal?: AbortSignal,
): Promise<SearchResults | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
      headers,
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as SearchResults;
  } catch {
    return null;
  }
}

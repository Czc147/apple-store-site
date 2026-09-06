/**
 * 社区 · 客户端取数工具（'use client' 组件使用）。
 * 只依赖 auth-context 的 getAuthHeaders 调用本站 /api/community。
 */

export interface CommunityPost {
  id: string;
  user_id: string;
  user_email: string | null;
  content: string;
  is_pinned: boolean;
  created_at: string;
  comment_count: number;
  like_count: number;
  liked_by_me: boolean;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  user_id: string;
  user_email: string | null;
  content: string;
  created_at: string;
}

type Headers = () => Promise<Record<string, string>>;

/** 帖子列表（公开读取；带登录态时附带 liked_by_me） */
export async function fetchCommunity(
  getAuthHeaders: Headers,
): Promise<CommunityPost[] | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/community', { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { posts: CommunityPost[] };
    return Array.isArray(data.posts) ? data.posts : [];
  } catch {
    return null;
  }
}

/** 发帖（需登录） */
export async function createPost(
  getAuthHeaders: Headers,
  content: string,
): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/community', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ content }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 点赞/取消赞（需登录），返回切换后的状态 */
export async function toggleLike(
  getAuthHeaders: Headers,
  postId: string,
): Promise<boolean | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/community/posts/${postId}/like`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { liked: boolean };
    return data.liked;
  } catch {
    return null;
  }
}

/** 某帖评论列表（公开读取） */
export async function fetchComments(
  getAuthHeaders: Headers,
  postId: string,
): Promise<CommunityComment[] | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/community/posts/${postId}/comments`, { headers });
    if (!res.ok) return null;
    return (await res.json()) as CommunityComment[];
  } catch {
    return null;
  }
}

/** 发表评论（需登录） */
export async function addComment(
  getAuthHeaders: Headers,
  postId: string,
  content: string,
): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/community/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ content }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 删帖（作者本人 / 管理员） */
export async function deletePost(
  getAuthHeaders: Headers,
  postId: string,
): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/community/posts/${postId}`, {
      method: 'DELETE',
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

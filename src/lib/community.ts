/**
 * 社区 · 客户端取数工具（'use client' 组件使用）。
 * 只依赖 auth-context 的 getAuthHeaders 调用本站 /api/community。
 */

export interface CommunityAuthor {
  display_name: string;
  avatar_key: string;
  avatar_url: string | null;
}

export interface CommunityPost {
  id: string;
  user_id: string;
  user_email: string | null;
  author: CommunityAuthor | null;
  content: string;
  /** 帖子配图（迁移 024）：public images 桶直链，最多 9 张；纯文本帖为空数组 */
  images: string[];
  is_pinned: boolean;
  created_at: string;
  comment_count: number;
  like_count: number;
  liked_by_me: boolean;
  /** 是否已被我收藏（迁移 027；未登录恒 false） */
  bookmarked_by_me: boolean;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  user_id: string;
  user_email: string | null;
  author: CommunityAuthor | null;
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

/** 发帖（需登录）。images 为本站 storage 的公开直链，最多 9 张；纯图帖允许无文案 */
export async function createPost(
  getAuthHeaders: Headers,
  content: string,
  images: string[] = [],
): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/community', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ content, images }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 单张帖子配图上传（需登录）；成功返回公开直链，失败返回 null */
export async function uploadPostImage(
  getAuthHeaders: Headers,
  file: File,
): Promise<string | null> {
  try {
    const headers = await getAuthHeaders();
    const body = new FormData();
    body.append('file', file);
    const res = await fetch('/api/community/upload', {
      method: 'POST',
      headers,
      body,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return typeof data.url === 'string' && data.url ? data.url : null;
  } catch {
    return null;
  }
}

/** 点赞/取消赞后返回权威结果：liked 是否已赞 + like_count 后端真实数量 */
export interface LikeResult {
  liked: boolean;
  like_count: number;
}

/** 点赞/取消赞（需登录），返回切换后的状态；失败返回 null */
export async function toggleLike(
  getAuthHeaders: Headers,
  postId: string,
): Promise<LikeResult | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/community/posts/${postId}/like`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) return null;
    return (await res.json()) as LikeResult;
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

/** 删除评论（作者本人 / 管理员） */
export async function deleteComment(
  getAuthHeaders: Headers,
  postId: string,
  commentId: string,
): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(
      `/api/community/posts/${postId}/comments/${commentId}`,
      { method: 'DELETE', headers },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** 收藏/取消收藏（需登录），返回切换后的状态；失败返回 null */
export async function toggleBookmark(
  getAuthHeaders: Headers,
  postId: string,
): Promise<{ bookmarked: boolean } | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/community/posts/${postId}/bookmark`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) return null;
    return (await res.json()) as { bookmarked: boolean };
  } catch {
    return null;
  }
}

/** 举报帖子；返回 null 表示请求失败，否则给出可展示的结果 */
export async function reportPost(
  getAuthHeaders: Headers,
  postId: string,
  reason: string,
  detail: string,
): Promise<{ ok: true; duplicated: boolean } | { ok: false; error: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/community/posts/${postId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ reason, detail }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      duplicated?: boolean;
    };
    if (!res.ok) return { ok: false, error: data.error ?? '举报失败' };
    return { ok: true, duplicated: Boolean(data.duplicated) };
  } catch {
    return { ok: false, error: '网络异常，请稍后再试' };
  }
}

// ---------------------------------------------------------------- 收藏流
// 「对话」板块里的「我的收藏」：收藏的帖子与自己的备注排成一条时间线。

export interface BookmarkPostSnapshot {
  id: string;
  content: string;
  images: string[];
  created_at: string;
  is_pinned: boolean;
  author: CommunityAuthor | null;
}

export interface BookmarkEntry {
  id: string;
  /** post = 收藏的帖子；note = 自己写的一句备注 */
  kind: 'post' | 'note';
  content: string;
  created_at: string;
  /** kind='post' 时的帖子快照；原帖已删则为 null */
  post: BookmarkPostSnapshot | null;
}

/** 我的收藏流（按时间正序） */
export async function fetchBookmarks(
  getAuthHeaders: Headers,
): Promise<BookmarkEntry[] | null> {
  try {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) return null;
    const res = await fetch('/api/bookmarks', { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { entries: BookmarkEntry[] };
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return null;
  }
}

/** 在收藏流里给自己写一句备注 */
export async function addBookmarkNote(
  getAuthHeaders: Headers,
  content: string,
): Promise<BookmarkEntry | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) return null;
    return (await res.json()) as BookmarkEntry;
  } catch {
    return null;
  }
}

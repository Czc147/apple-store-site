'use client';

/**
 * 个人主页 · 客户端取数。
 */

/** 我与此人的关系（决定主页上显示哪个按钮） */
export type Relation = 'me' | 'friend' | 'outgoing' | 'incoming' | 'none';

export interface ProfilePost {
  id: string;
  content: string;
  images: string[];
  created_at: string;
  is_pinned: boolean;
  like_count: number;
}

export interface ProfileGroupBuy {
  id: string;
  status: 'open' | 'full' | 'closed' | 'expired';
  product_name: string;
  per_price: number;
  member_count: number;
  target_count: number;
  expires_at: string;
}

export interface UserProfileData {
  profile: {
    user_id: string;
    display_name: string;
    avatar_key: string | null;
    avatar_url: string | null;
  };
  relation: Relation;
  friendship_id: string | null;
  post_count: number;
  posts: ProfilePost[];
  group_buys: ProfileGroupBuy[];
}

type Headers = () => Promise<Record<string, string>>;

/** 自己的名片（`GET /api/profile`）。比 `/api/users/<id>` 轻得多：不带作品与拼单 */
export interface MyProfile {
  user_id: string;
  display_name: string;
  avatar_key: string | null;
  avatar_url: string | null;
}

export async function fetchMyProfile(
  getAuthHeaders: Headers,
): Promise<MyProfile | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/profile', { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { profile: MyProfile };
    return data.profile ?? null;
  } catch {
    return null;
  }
}

export async function fetchUserProfile(
  getAuthHeaders: Headers,
  userId: string,
): Promise<UserProfileData | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/users/${userId}`, { headers });
    if (!res.ok) return null;
    return (await res.json()) as UserProfileData;
  } catch {
    return null;
  }
}

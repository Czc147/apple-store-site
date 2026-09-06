'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  createPost,
  deletePost,
  fetchCommunity,
  toggleLike,
  type CommunityPost,
} from '@/lib/community';
import EmptyState from '@/components/ui/EmptyState';
import NewPostComposer from './NewPostComposer';
import PostCard from './PostCard';

function CommunitySkeleton() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-20 rounded-card" />
      <div className="skeleton h-24 rounded-card" />
      <div className="skeleton h-24 rounded-card" />
    </div>
  );
}

/** 社区页主体：发帖框 + 帖子流（置顶在前）；发帖/点赞/评论/删帖即时更新 */
export default function CommunityClient() {
  const { user, getAuthHeaders } = useAuth();
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);

  const isLoggedIn = Boolean(user);

  const load = useCallback(async () => {
    const list = await fetchCommunity(getAuthHeaders);
    setPosts(list ?? []);
  }, [getAuthHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePost = async (content: string) => {
    const created = await createPost(getAuthHeaders, content);
    if (created) await load();
    return created;
  };

  const handleLike = async (postId: string, next: boolean) => {
    // 乐观更新；失败回滚
    setPosts((prev) =>
      (prev ?? []).map((p) =>
        p.id === postId
          ? {
              ...p,
              liked_by_me: next,
              like_count: p.like_count + (next ? 1 : -1),
            }
          : p,
      ),
    );
    const result = await toggleLike(getAuthHeaders, postId);
    if (result === null) {
      setPosts((prev) =>
        (prev ?? []).map((p) =>
          p.id === postId
            ? {
                ...p,
                liked_by_me: !next,
                like_count: p.like_count + (next ? -1 : 1),
              }
            : p,
        ),
      );
    }
  };

  const handleDelete = async (postId: string) => {
    const deleted = await deletePost(getAuthHeaders, postId);
    if (deleted) await load();
  };

  const handleCommentAdded = (postId: string) => {
    setPosts((prev) =>
      (prev ?? []).map((p) =>
        p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p,
      ),
    );
  };

  if (posts === null) return <CommunitySkeleton />;

  if (posts.length === 0) {
    return (
      <>
        <NewPostComposer isLoggedIn={isLoggedIn} onSubmit={handlePost} />
        <div className="mt-4">
          <EmptyState
            icon={MessagesSquare}
            title="还没有帖子"
            description="发布第一条动态，和大家打个招呼吧。"
          />
        </div>
      </>
    );
  }

  return (
    <div className="space-y-3">
      <NewPostComposer isLoggedIn={isLoggedIn} onSubmit={handlePost} />
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          isOwner={Boolean(user) && post.user_id === user?.id}
          getAuthHeaders={getAuthHeaders}
          isLoggedIn={isLoggedIn}
          onLike={(id, next) => void handleLike(id, next)}
          onDelete={(id) => void handleDelete(id)}
          onCommentAdded={handleCommentAdded}
        />
      ))}
    </div>
  );
}

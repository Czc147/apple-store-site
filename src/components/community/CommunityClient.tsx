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
import DataError from '@/components/ui/DataError';
import NewPostComposer from './NewPostComposer';
import PostCard from './PostCard';

/** 骨架与真实布局同构（发帖框 + 帖子卡 + 作者行/正文/操作行，UI 升级 §9.5），避免加载完成跳变 */
function CommunitySkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite" aria-label="社区加载中">
      {/* 发帖入口 */}
      <div className="rounded-card-lg bg-apple-card p-3 sm:p-4">
        <div className="skeleton h-16 w-full rounded-input" />
        <div className="mt-2 flex justify-end">
          <div className="skeleton h-9 w-20 rounded-btn" />
        </div>
      </div>
      {/* 帖子卡 ×2 */}
      {[0, 1].map((i) => (
        <div key={i} className="rounded-card-lg bg-apple-card p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <div className="skeleton h-9 w-9 rounded-full" />
            <div className="space-y-1.5">
              <div className="skeleton h-3.5 w-24 rounded-full" />
              <div className="skeleton h-3 w-16 rounded-full" />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="skeleton h-4 w-full rounded-full" />
            <div className="skeleton h-4 w-4/5 rounded-full" />
          </div>
          {/* 操作行：真实行高 44px，内容只有小号图标 + 计数 */}
          <div className="mt-2 flex h-11 items-center gap-3">
            <div className="skeleton h-4 w-10 rounded-full" />
            <div className="skeleton h-4 w-12 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 社区页主体：发帖框 + 帖子流（置顶在前）；发帖/点赞/评论/删帖即时更新。
 * UI 升级 §8.5：阅读优先、减少装饰 —— 白底阅读面（卡片自带圆角，无描边/投影），
 * 发帖入口与内容流同一材质，层级靠背景差异而非卡片装饰。数据流与业务逻辑不变。
 */
export default function CommunityClient() {
  const { user, getAuthHeaders } = useAuth();
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  // audit 修复：取数失败曾静默变「还没有帖子」，错误伪装成空态且无从重试
  const [loadFailed, setLoadFailed] = useState(false);

  const isLoggedIn = Boolean(user);

  const load = useCallback(async () => {
    const list = await fetchCommunity(getAuthHeaders);
    if (list === null) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setPosts(list);
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
    // 乐观更新；成功后以后端返回的真实 like_count 兜底（防止 ±1 与真实值漂移），失败回滚
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
    } else {
      setPosts((prev) =>
        (prev ?? []).map((p) =>
          p.id === postId
            ? { ...p, liked_by_me: result.liked, like_count: result.like_count }
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

  const handleCommentDeleted = (postId: string) => {
    setPosts((prev) =>
      (prev ?? []).map((p) =>
        p.id === postId
          ? { ...p, comment_count: Math.max(0, p.comment_count - 1) }
          : p,
      ),
    );
  };

  if (loadFailed && posts === null) {
    return (
      <>
        <NewPostComposer isLoggedIn={isLoggedIn} onSubmit={handlePost} />
        <div className="mt-4">
          <DataError
            message="帖子加载失败，请检查网络后重试"
            onRetry={() => void load()}
            size="inline"
          />
        </div>
      </>
    );
  }

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
          currentUserId={user?.id ?? null}
          getAuthHeaders={getAuthHeaders}
          isLoggedIn={isLoggedIn}
          onLike={(id, next) => void handleLike(id, next)}
          onDelete={(id) => void handleDelete(id)}
          onCommentAdded={handleCommentAdded}
          onCommentDeleted={handleCommentDeleted}
        />
      ))}
    </div>
  );
}

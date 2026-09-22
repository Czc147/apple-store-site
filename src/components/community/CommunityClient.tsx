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
import PostDetailSheet from './PostDetailSheet';

/** 骨架与真实布局同构（发帖框 + 帖子卡 + 作者行/正文/操作行，UI 升级 §9.5），避免加载完成跳变 */
function CommunitySkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite" aria-label="探究加载中">
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
  /** 打开详情层的那条帖子 id（存 id 而不是整条：点赞/评论后要跟着最新数据走） */
  const [detailId, setDetailId] = useState<string | null>(null);

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

  /**
   * 滚到 hash 指向的那条帖子并闪一下高亮。
   *
   * 两处必须自己做：
   * 1. 帖子的 DOM 是**取数之后**才渲染的，浏览器自带的 hash 定位在页面加载
   *    那一刻就执行了，那时元素还不存在 → 直接扑空。
   * 2. **已经在本页时**点「查看原帖 / 搜索结果」，地址栏只是换了 hash：
   *    Next 的 <Link> 走 pushState，**既不触发 hashchange 也不重新取数**，
   *    依赖 posts 的 effect 不会重跑 → 页面纹丝不动（用户报的 #2 / #4）。
   *    所以调用方改用普通 <a>（同文档导航会触发 hashchange），这里再挂监听。
   *
   * 高亮用 Web Animations 直接打在元素上，不走 React state —— 免得为了一次
   * 两秒的闪烁给整条组件链加一个 highlight prop。
   */
  const scrollToHash = useCallback(() => {
    const m = window.location.hash.match(/^#post-(.+)$/);
    if (!m) return;
    const el = document.getElementById(`post-${m[1]}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.animate(
      [
        { backgroundColor: 'rgba(0, 113, 227, 0.10)' },
        { backgroundColor: 'transparent' },
      ],
      { duration: 1800, easing: 'ease-out' },
    );
  }, []);

  useEffect(() => {
    if (!posts || posts.length === 0) return;
    scrollToHash();
  }, [posts, scrollToHash]);

  useEffect(() => {
    window.addEventListener('hashchange', scrollToHash);
    return () => window.removeEventListener('hashchange', scrollToHash);
  }, [scrollToHash]);

  const handlePost = async (content: string, images: string[] = []) => {
    const created = await createPost(getAuthHeaders, content, images);
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

  const detailPost = detailId
    ? posts.find((p) => p.id === detailId) ?? null
    : null;

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
          onOpenDetail={(p) => setDetailId(p.id)}
        />
      ))}

      {/* 详情层：从最新的 posts 里按 id 取，保证点赞/评论数实时同步 */}
      {detailPost && (
        <PostDetailSheet
          post={detailPost}
          onClose={() => setDetailId(null)}
          isOwner={Boolean(user) && detailPost.user_id === user?.id}
          currentUserId={user?.id ?? null}
          getAuthHeaders={getAuthHeaders}
          isLoggedIn={isLoggedIn}
          onLike={(id, next) => void handleLike(id, next)}
          onDelete={(id) => {
            setDetailId(null); // 删掉了就别停在详情层上
            void handleDelete(id);
          }}
          onCommentAdded={handleCommentAdded}
          onCommentDeleted={handleCommentDeleted}
        />
      )}
    </div>
  );
}

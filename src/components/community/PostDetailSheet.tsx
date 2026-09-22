'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, MessageSquare } from 'lucide-react';
import type { CommunityPost } from '@/lib/community';
import PostCard from './PostCard';
import CommentList from './CommentList';

interface PostDetailSheetProps {
  post: CommunityPost;
  onClose: () => void;
  currentUserId: string | null;
  getAuthHeaders: () => Promise<Record<string, string>>;
  isLoggedIn: boolean;
  isOwner: boolean;
  onLike: (postId: string, next: boolean) => void;
  onDelete: (postId: string) => void;
  onCommentAdded: (postId: string) => void;
  onCommentDeleted: (postId: string) => void;
  onBookmarkChanged?: (postId: string, bookmarked: boolean) => void;
}

/**
 * 帖子详情层（用户需求 #2a：点帖子进入独属于它的层，往下翻是评论）。
 *
 * 实现上刻意**复用 PostCard**（hideComments 模式）+ **复用 CommentList**，
 * 而不是把帖子重新画一遍：帖子卡上已经有配图查看器、点赞/收藏动画、
 * 更多菜单、加好友、长文折叠、双击点赞 —— 复制一遍既臃肿又会两边走样。
 * 详情层只做三件新事：独占一层、把评论铺开（不走手风琴）、返回按钮。
 *
 * 几个容易忽略的点：
 * - **锁 body 滚动**：不锁的话背景列表会跟着手指一起动
 * - **Esc 关闭**：浮层的基本预期
 * - **Portal 到 body**：详情层会被 `.animate-feed-enter` 之类的祖先影响包含块，
 *   挂在 body 下最省心（与 AlbumStackCard 的展开层同一套处理）
 */
export default function PostDetailSheet({
  post,
  onClose,
  currentUserId,
  getAuthHeaders,
  isLoggedIn,
  isOwner,
  onLike,
  onDelete,
  onCommentAdded,
  onCommentDeleted,
  onBookmarkChanged,
}: PostDetailSheetProps) {
  const [mounted, setMounted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-sheet flex flex-col bg-apple-bg"
      role="dialog"
      aria-modal="true"
      aria-label="帖子详情"
    >
      {/* 顶栏：返回 + 标题。吸顶，往下翻评论时永远能退出去 */}
      <header className="glass sticky top-0 z-panel flex items-center gap-1 border-b border-apple-hairline px-page pb-2 pt-[calc(env(safe-area-inset-top)+8px)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="返回"
          className="-ml-2 inline-flex h-11 w-11 flex-none items-center justify-center rounded-full text-apple-text-2 transition-colors duration-fast ease-apple hover:text-apple-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <h1 className="text-lg font-semibold text-apple-text">帖子</h1>
      </header>

      {/* 内容：帖子 + 铺开的评论 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-page pb-[calc(env(safe-area-inset-bottom)+24px)] pt-3"
      >
        <div className="mx-auto max-w-wide space-y-3">
          <PostCard
            post={post}
            isOwner={isOwner}
            currentUserId={currentUserId}
            getAuthHeaders={getAuthHeaders}
            isLoggedIn={isLoggedIn}
            onLike={onLike}
            onDelete={onDelete}
            onCommentAdded={onCommentAdded}
            onCommentDeleted={onCommentDeleted}
            onBookmarkChanged={onBookmarkChanged}
            // 评论区由下面铺开，卡里就不再折叠一份了
            hideComments
          />

          <section className="rounded-card-lg bg-apple-card p-4 sm:p-5">
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-apple-text">
              <MessageSquare className="h-4 w-4 text-apple-text-3" aria-hidden />
              评论
              {post.comment_count > 0 && (
                <span className="text-sm font-normal tabular-nums text-apple-text-3">
                  {post.comment_count}
                </span>
              )}
            </h2>

            <div className="mt-3">
              <CommentList
                postId={post.id}
                currentUserId={currentUserId}
                getAuthHeaders={getAuthHeaders}
                isLoggedIn={isLoggedIn}
                onAdded={onCommentAdded}
                onDeleted={onCommentDeleted}
              />
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

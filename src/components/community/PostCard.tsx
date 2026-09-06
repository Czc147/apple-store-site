'use client';

import { useState } from 'react';
import { ChevronDown, Heart, MessageCircle, Pin, Trash2 } from 'lucide-react';
import type { CommunityPost } from '@/lib/community';
import CommentList from './CommentList';

interface PostCardProps {
  post: CommunityPost;
  isOwner: boolean;
  getAuthHeaders: () => Promise<Record<string, string>>;
  isLoggedIn: boolean;
  onLike: (postId: string, next: boolean) => void;
  onDelete: (postId: string) => void;
  onCommentAdded: (postId: string) => void;
}

/** 社区帖子卡片：正文 + 点赞/评论；评论手风琴展开；作者可删 */
export default function PostCard({
  post,
  isOwner,
  getAuthHeaders,
  isLoggedIn,
  onLike,
  onDelete,
  onCommentAdded,
}: PostCardProps) {
  const [openComments, setOpenComments] = useState(false);

  return (
    <article className="overflow-hidden rounded-card border border-apple-border bg-apple-card shadow-card">
      <div className="p-4">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold text-white ${
              post.is_pinned ? 'bg-apple-blue' : 'bg-gradient-to-br from-apple-text-2 to-apple-text-3'
            }`}
            aria-hidden
          >
            {(post.user_email ?? 'Z').slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 text-[13px] font-medium text-apple-text">
            {post.is_pinned ? (
              <span className="inline-flex items-center gap-1 text-apple-blue">
                <Pin className="h-3.5 w-3.5" aria-hidden />
                置顶通知
              </span>
            ) : (
              post.user_email?.split('@')[0] ?? '用户'
            )}
          </span>
          <span className="text-[11.5px] text-apple-text-3">
            {new Date(post.created_at).toLocaleDateString('zh-CN')}
          </span>
        </div>

        <p className="mt-3 break-words whitespace-pre-wrap text-[14.5px] leading-relaxed text-apple-text">
          {post.content}
        </p>

        <div className="mt-3 flex items-center gap-5">
          <button
            type="button"
            onClick={() => onLike(post.id, !post.liked_by_me)}
            className={`inline-flex items-center gap-1.5 text-[12.5px] transition active:scale-95 ${
              post.liked_by_me ? 'text-apple-blue' : 'text-apple-text-3'
            }`}
            aria-pressed={post.liked_by_me}
          >
            <Heart
              className={`h-4 w-4 ${post.liked_by_me ? 'fill-current' : ''}`}
              aria-hidden
            />
            {post.like_count}
          </button>

          <button
            type="button"
            onClick={() => setOpenComments((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-apple-text-3 transition active:scale-95"
            aria-expanded={openComments}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            {post.comment_count}
          </button>

          {isOwner && (
            <button
              type="button"
              onClick={() => onDelete(post.id)}
              className="ml-auto inline-flex items-center gap-1 text-[12px] text-apple-text-3 transition hover:text-red-500 active:scale-95"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              删除
            </button>
          )}
        </div>
      </div>

      {openComments && (
        <div className="border-t border-apple-hairline px-4 py-3">
          <CommentList
            postId={post.id}
            getAuthHeaders={getAuthHeaders}
            isLoggedIn={isLoggedIn}
            onAdded={onCommentAdded}
          />
        </div>
      )}
    </article>
  );
}

'use client';

import { useState } from 'react';
import { ChevronDown, Heart, MessageCircle, Pin, Trash2 } from 'lucide-react';
import type { CommunityPost } from '@/lib/community';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import CommentList from './CommentList';

interface PostCardProps {
  post: CommunityPost;
  isOwner: boolean;
  currentUserId: string | null;
  getAuthHeaders: () => Promise<Record<string, string>>;
  isLoggedIn: boolean;
  onLike: (postId: string, next: boolean) => void;
  onDelete: (postId: string) => void;
  onCommentAdded: (postId: string) => void;
  onCommentDeleted: (postId: string) => void;
}

/**
 * 社区帖子卡（UI 升级 §8.5：阅读优先，减少装饰）。
 * - 白底阅读面：去掉卡片描边与投影，层级靠「白面 + 圆角 + 背景差异」表达
 * - 层级 = 作者 → 时间 → 正文（叙事级字号 + 宽松行距）→ 弱化操作行
 * - 操作按钮弱化：常规字重、灰字，命中仍保持 44pt（负边距扩区，不吃布局）
 * - 不使用 Premium Glass（社区普通帖属 §3.3 明确禁用范围）
 * - 帖子暂无图片字段：如后续出现图片位，统一用 rounded-card（20px，§8.5 的 16–20px）
 *
 * 业务行为不变：点赞乐观更新 + 后端真实值兜底、评论懒挂载、删除入口与原状一致。
 */
export default function PostCard({
  post,
  isOwner,
  currentUserId,
  getAuthHeaders,
  isLoggedIn,
  onLike,
  onDelete,
  onCommentAdded,
  onCommentDeleted,
}: PostCardProps) {
  const [openComments, setOpenComments] = useState(false);
  // 懒挂载：首次展开才请求评论（保持原按需加载行为，收起后缓存保留）
  const [commentsMounted, setCommentsMounted] = useState(false);

  // 官方帖 = 无 user_id 的置顶帖（与 /api/community 的 OFFICIAL_AUTHOR 映射一致）
  const isOfficial = !post.user_id && post.is_pinned;

  const toggleComments = () => {
    if (!openComments) setCommentsMounted(true);
    setOpenComments(!openComments);
  };

  return (
    <article className="rounded-card-lg bg-apple-card">
      <div className="p-4 sm:p-5">
        {/* 作者行：头像 + 昵称/徽章 + 相对时间 */}
        <div className="flex items-center gap-2.5">
          <Avatar
            avatarKey={post.author?.avatar_key}
            avatarUrl={post.author?.avatar_url}
            name={post.author?.display_name ?? post.user_email}
            size={36}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-base font-semibold text-apple-text">
                {post.author?.display_name ?? post.user_email?.split('@')[0] ?? '用户'}
              </span>
              {isOfficial && (
                <Badge tone="blue" size="sm">
                  官方
                </Badge>
              )}
              {post.is_pinned && !isOfficial && (
                <Pin className="h-3.5 w-3.5 shrink-0 text-apple-blue" aria-label="置顶" />
              )}
            </div>
            <p className="mt-0.5 text-2xs text-apple-text-3">{timeAgo(post.created_at)}</p>
          </div>
        </div>

        {/* 正文 —— content-first：叙事级字号 + 宽松行距，长文阅读为主 */}
        <p className="mt-3 break-words whitespace-pre-wrap text-editorial leading-relaxed text-apple-text">
          {post.content}
        </p>

        {/* 操作行：弱化（灰字、常规字重），命中仍 44pt（负边距补偿不占布局） */}
        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => onLike(post.id, !post.liked_by_me)}
            aria-pressed={post.liked_by_me}
            aria-label={post.liked_by_me ? '取消点赞' : '点赞'}
            className={cn(
              '-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-btn px-2 text-xs',
              'transition-[color,transform] duration-fast ease-apple active:scale-[0.97]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40',
              post.liked_by_me
                ? 'text-apple-blue'
                : 'text-apple-text-3 hover:text-apple-text-2',
            )}
          >
            <Heart
              className={cn('h-4 w-4 transition-colors duration-fast', post.liked_by_me && 'fill-current')}
              aria-hidden
            />
            {post.like_count}
          </button>

          <button
            type="button"
            onClick={toggleComments}
            aria-expanded={openComments}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-btn px-2 text-xs text-apple-text-3 transition-[color,transform] duration-fast ease-apple hover:text-apple-text-2 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            {post.comment_count}
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-base ease-apple',
                openComments && 'rotate-180',
              )}
              aria-hidden
            />
          </button>

          {isOwner && (
            <button
              type="button"
              onClick={() => onDelete(post.id)}
              className="-mr-2 ml-auto inline-flex min-h-11 items-center gap-1 rounded-btn px-2 text-xs text-apple-text-3 transition-colors duration-fast ease-apple hover:text-apple-danger active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-danger/40"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              删除
            </button>
          )}
        </div>
      </div>

      {/* 评论手风琴：grid-rows 过渡 */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-slow ease-apple',
          openComments ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-apple-hairline px-4 py-3.5 sm:px-5">
            {commentsMounted && (
              <CommentList
                postId={post.id}
                currentUserId={currentUserId}
                getAuthHeaders={getAuthHeaders}
                isLoggedIn={isLoggedIn}
                onAdded={onCommentAdded}
                onDeleted={onCommentDeleted}
              />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

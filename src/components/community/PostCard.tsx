'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  ChevronDown,
  Flag,
  Heart,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type { CommunityPost } from '@/lib/community';
import { requestFriend } from '@/lib/dm';
import { reportPost, toggleBookmark } from '@/lib/community';
import { copyText } from '@/lib/clipboard';
import { useDoubleTap, useLongPress } from '@/lib/gestures';
import {
  REPORT_REASONS,
  reportReasonLabel,
  type ReportReason,
} from '@/lib/report-reasons';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import BottomSheet from '@/components/ui/BottomSheet';
import ListRow from '@/components/ui/ListRow';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import CommentList from './CommentList';
import PostContent, { COLLAPSE_LINES } from './PostContent';
import PostImages from './PostImages';
import MediaViewer from './MediaViewer';

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
  /** 收藏状态变化时通知外层（收藏流那边要跟着更新） */
  onBookmarkChanged?: (postId: string, bookmarked: boolean) => void;
  /**
   * 单击帖子正文/配图 → 打开详情层（推特那套：单击进详情、双击点赞）。
   * 不传则单击无动作（收藏流等只读场景）。
   */
  onOpenDetail?: (post: CommunityPost) => void;
  /**
   * 详情层里用：不渲染评论手风琴。
   * 详情层自己会在帖子下方铺开完整评论区，再留一个折叠版就重复了。
   */
  hideComments?: boolean;
}

/**
 * 帖子卡（UI 升级 §8.5 阅读优先；2026-09-22 按 UI.docx 补微交互）。
 *
 * 本轮新增（均取自 UI.docx，实现按本站栈重写）：
 * - 正文解析 @提及 / #话题 / 链接 + **超 5 行折叠**
 * - **双击点赞**（心形缩放动画，第三处获批的过冲）
 * - **收藏**（帖子可从「对话 → 我的收藏」回看）
 * - **更多菜单**：复制链接 / 收藏 / 举报 / 删除 —— 移动端用底部面板，
 *   文档第 27 条明确要求小屏不许用小下拉
 * - **图片全屏查看器**（双指缩放 / 左右滑 / 点击关闭）
 *
 * 未照搬文档的部分：它的 `toggleLike` 用旧闭包值算计数（连点会漂移）、
 * `useDoubleTap` 三连点会触发两次、`MediaGrid` 硬砍到 4 张 —— 见各文件注释。
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
  onBookmarkChanged,
  onOpenDetail,
  hideComments = false,
}: PostCardProps) {
  const [openComments, setOpenComments] = useState(false);
  // 懒挂载：首次展开才请求评论（保持原按需加载行为，收起后缓存保留）
  const [commentsMounted, setCommentsMounted] = useState(false);

  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportDetail, setReportDetail] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMsg, setReportMsg] = useState<string | null>(null);

  const [bookmarked, setBookmarked] = useState(post.bookmarked_by_me);
  const [bookmarkPulse, setBookmarkPulse] = useState(0);
  const [likePulse, setLikePulse] = useState(0);
  /** 复制结果提示：'ok' / 'fail'，null = 不显示 */
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // 外部（重新拉取）把收藏状态改了就跟随
  useEffect(() => setBookmarked(post.bookmarked_by_me), [post.bookmarked_by_me]);

  // 官方帖 = 无 user_id 的置顶帖（与 /api/community 的 OFFICIAL_AUTHOR 映射一致）
  const isOfficial = !post.user_id && post.is_pinned;

  /**
   * 判断正文是否超过 5 行。
   * 不能只看字符数：带换行的短文本也会占很多行。
   * 量的时候要**先把 clamp 摘掉**——钳住之后量到的就是钳后的高度，永远不超标。
   */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const prev = el.style.webkitLineClamp;
    el.style.webkitLineClamp = 'unset';
    const full = el.scrollHeight;
    el.style.webkitLineClamp = prev;
    const line = parseFloat(getComputedStyle(el).lineHeight) || 24;
    setOverflows(full > line * COLLAPSE_LINES + 2);
  }, [post.content]);

  const toggleComments = () => {
    if (!openComments) setCommentsMounted(true);
    setOpenComments(!openComments);
  };

  const handleLike = (next: boolean) => {
    if (!isLoggedIn) return;
    if (next && !post.liked_by_me) setLikePulse((n) => n + 1);
    onLike(post.id, next);
  };

  // 单击进详情、双击点赞（推特那套）。
  // 双击只**置为已赞**、不切换 —— 双击是"表达喜欢"，不该把点过的赞取消掉。
  // useDoubleTap 会把单击延迟到双击窗口之后，所以双击时详情层不会先弹出来。
  const handleTap = useDoubleTap(
    () => {
      if (!post.liked_by_me) handleLike(true);
    },
    onOpenDetail ? () => onOpenDetail(post) : undefined,
  );

  const handleBookmark = async () => {
    if (!isLoggedIn) return;
    const next = !bookmarked;
    setBookmarked(next);
    if (next) setBookmarkPulse((n) => n + 1);
    const res = await toggleBookmark(getAuthHeaders, post.id);
    if (!res) {
      setBookmarked(!next); // 失败回滚
      return;
    }
    setBookmarked(res.bookmarked);
    onBookmarkChanged?.(post.id, res.bookmarked);
  };

  const handleCopyLink = async () => {
    // 帖子流在广场的「交流」板块（不是探究页 —— 那页只剩官方公告）
    const url = `${window.location.origin}/community/plaza#post-${post.id}`;
    const ok = await copyText(url);
    // 成功/失败给不同提示：原来失败时弹 prompt 兜底，但非安全上下文下
    // 用户是"点了没反应"，不知道到底复制上没有
    setCopied(ok ? 'ok' : 'fail');
    if (!ok) window.prompt('复制这条链接：', url);
    window.setTimeout(() => setCopied(null), 1800);
  };

  const submitReport = async () => {
    if (!reportReason) return;
    setReportBusy(true);
    setReportMsg(null);
    const res = await reportPost(getAuthHeaders, post.id, reportReason, reportDetail);
    setReportBusy(false);
    if (!res.ok) {
      setReportMsg(res.error);
      return;
    }
    setReportOpen(false);
    setReportReason(null);
    setReportDetail('');
  };

  // 长按帖子 → 打开更多菜单（UI.docx 第 24 条）
  const longPress = useLongPress(() => setMenuOpen(true));

  const collapsed = overflows && !expanded;

  return (
    <article id={`post-${post.id}`} className="animate-feed-enter rounded-card-lg bg-apple-card">
      <div
        className={cn('p-4 sm:p-5', !expanded && 'select-none')}
        {...longPress}
      >
        {/* 作者行：头像 + 昵称/徽章 + 相对时间 */}
        <div className="flex items-center gap-2.5">
          {/* 头像可点 → 进他的主页（用户需求 #5）。官方帖没有 user_id，不给链接 */}
          {post.user_id ? (
            <Link
              href={`/u/${post.user_id}`}
              aria-label={`查看 ${post.author?.display_name ?? '用户'} 的主页`}
              className="pressable-soft flex-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
            >
              <Avatar
                avatarKey={post.author?.avatar_key}
                avatarUrl={post.author?.avatar_url}
                name={post.author?.display_name ?? post.user_email}
                size={36}
              />
            </Link>
          ) : (
            <Avatar
              avatarKey={post.author?.avatar_key}
              avatarUrl={post.author?.avatar_url}
              name={post.author?.display_name ?? post.user_email}
              size={36}
            />
          )}
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
              {/* 加好友入口（用户要求：帖子上点作者加好友） */}
              {!isOwner && !isOfficial && post.user_id && (
                <AddFriendButton
                  userId={post.user_id}
                  getAuthHeaders={getAuthHeaders}
                  isLoggedIn={isLoggedIn}
                />
              )}
            </div>
            <p className="mt-0.5 text-2xs text-apple-text-3">{timeAgo(post.created_at)}</p>
          </div>

          {/* 更多：桌面可点，移动端也支持长按帖子打开 */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="更多操作"
            className="-mr-2 inline-flex h-11 w-11 flex-none items-center justify-center rounded-full text-apple-text-3 transition-colors duration-fast ease-apple hover:text-apple-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* 正文 + 配图：单击进详情 / 双击点赞的命中区 */}
        <div className="mt-3 cursor-default" onClick={handleTap}>
          <div
            className={cn(
              'max-w-[560px]',
              collapsed && 'line-clamp-5 overflow-hidden',
            )}
            ref={bodyRef}
          >
            <PostContent content={post.content} />
          </div>

          {overflows && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              className="mt-1 text-sm font-medium text-apple-blue transition-opacity duration-fast hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
            >
              {expanded ? '收起' : '展开'}
            </button>
          )}

          <PostImages
            images={post.images}
            onOpen={setViewerIndex}
            className="max-w-[560px]"
          />
        </div>

        {/* 操作行：评论 / 点赞 / 收藏 */}
        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            onClick={toggleComments}
            aria-expanded={openComments}
            aria-label="评论"
            className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-btn px-2 text-xs text-apple-text-3 hover:text-apple-text-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
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

          <button
            type="button"
            onClick={() => handleLike(!post.liked_by_me)}
            aria-pressed={post.liked_by_me}
            aria-label={post.liked_by_me ? '取消点赞' : '点赞'}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-btn px-2 text-xs',
              'pressable',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40',
              post.liked_by_me
                ? 'text-apple-danger'
                : 'text-apple-text-3 hover:text-apple-text-2',
            )}
          >
            {/* key 变化即重播动画（UI.docx 第 14 条） */}
            <Heart
              key={likePulse}
              className={cn(
                'h-4 w-4 transition-colors duration-fast',
                post.liked_by_me && 'fill-current',
                likePulse > 0 && 'animate-like-pop',
              )}
              aria-hidden
            />
            {post.like_count}
          </button>

          <button
            type="button"
            onClick={() => void handleBookmark()}
            aria-pressed={bookmarked}
            aria-label={bookmarked ? '取消收藏' : '收藏'}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-btn px-2 text-xs',
              'pressable',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40',
              bookmarked
                ? 'text-apple-blue'
                : 'text-apple-text-3 hover:text-apple-text-2',
            )}
          >
            <Bookmark
              key={bookmarkPulse}
              className={cn(
                'h-4 w-4',
                bookmarked && 'fill-current',
                bookmarkPulse > 0 && 'animate-bookmark-pop',
              )}
              aria-hidden
            />
          </button>

          {copied && (
            <span
              className={cn(
                'ml-1 text-2xs',
                copied === 'ok' ? 'text-apple-text-3' : 'text-apple-danger',
              )}
              role="status"
            >
              {copied === 'ok' ? '已复制链接' : '复制失败，请长按手动复制'}
            </span>
          )}
        </div>
      </div>

      {/* 评论手风琴：grid-rows 过渡（详情层里由外层铺开完整评论区，这里跳过） */}
      {!hideComments && (
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
      )}

      {/* 更多菜单：移动端一律走底部面板（UI.docx 第 27 条） */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="帖子操作">
        <div className="divide-y divide-apple-hairline">
          <ListRow
            title="复制链接"
            leading={<Link2 className="h-4 w-4" aria-hidden />}
            onClick={() => {
              setMenuOpen(false);
              void handleCopyLink();
            }}
          />
          <ListRow
            title={bookmarked ? '取消收藏' : '收藏'}
            subtitle={bookmarked ? '已在我的收藏里' : '收进「对话 → 我的收藏」'}
            leading={
              <Bookmark
                className={cn('h-4 w-4', bookmarked && 'fill-current text-apple-blue')}
                aria-hidden
              />
            }
            onClick={() => {
              setMenuOpen(false);
              void handleBookmark();
            }}
          />
          {!isOwner && (
            <ListRow
              title="举报"
              leading={<Flag className="h-4 w-4" aria-hidden />}
              onClick={() => {
                setMenuOpen(false);
                setReportOpen(true);
              }}
            />
          )}
          {isOwner && (
            <ListRow
              title="删除"
              destructive
              leading={<Trash2 className="h-4 w-4" aria-hidden />}
              onClick={() => {
                setMenuOpen(false);
                onDelete(post.id);
              }}
            />
          )}
        </div>
      </BottomSheet>

      {/* 举报面板 */}
      <BottomSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="举报这条帖子"
      >
        <div className="space-y-3">
          <p className="text-sm text-apple-text-2">
            选择理由后提交，站长会在后台看到。恶意举报会影响你的账号。
          </p>

          <div className="space-y-1.5">
            {REPORT_REASONS.map((r) => (
              <label
                key={r.key}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-card border px-3 py-2.5 text-base transition-colors duration-fast',
                  reportReason === r.key
                    ? 'border-apple-blue bg-apple-blue-soft text-apple-text'
                    : 'border-apple-border bg-apple-card text-apple-text-2 hover:bg-apple-bg',
                )}
              >
                <input
                  type="radio"
                  name={`report-${post.id}`}
                  className="h-4 w-4"
                  checked={reportReason === r.key}
                  onChange={() => setReportReason(r.key)}
                />
                {r.label}
              </label>
            ))}
          </div>

          {reportReason && (
            <textarea
              value={reportDetail}
              onChange={(e) => setReportDetail(e.target.value)}
              placeholder="补充说明（选填）"
              rows={3}
              maxLength={300}
              aria-label="补充说明"
              className="w-full resize-none rounded-input border border-transparent bg-apple-bg px-3.5 py-2.5 text-md text-apple-text outline-none placeholder:text-apple-text-3 focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20"
            />
          )}

          {reportMsg && (
            <p className="text-sm text-apple-danger" role="alert">
              {reportMsg}
            </p>
          )}

          <button
            type="button"
            disabled={!reportReason || reportBusy}
            onClick={() => void submitReport()}
            className="h-11 w-full rounded-btn bg-apple-danger text-md font-medium text-white pressable disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-danger/40"
          >
            {reportBusy ? '提交中…' : '提交举报'}
          </button>
          <p className="pb-2 text-center text-2xs text-apple-text-3">
            当前选择：{reportReason ? reportReasonLabel(reportReason) : '未选择'}
          </p>
        </div>
      </BottomSheet>

      {/* 图片全屏查看器 */}
      {viewerIndex !== null && post.images.length > 0 && (
        <MediaViewer
          images={post.images}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </article>
  );
}

/**
 * 帖子作者旁的「加好友」按钮（用户要求：帖子上点作者加好友）。
 *
 * 不做"先查好友列表再决定显示什么"：那要给每张卡传全局好友表，代价大且容易不同步。
 * 这里直接发申请，按 API 返回的文案把按钮切到「已申请」「已是好友」——
 * 服务端本来就是唯一权威，重复点也只是拿到一句 409 文案，不会重复写库。
 */
function AddFriendButton({
  userId,
  getAuthHeaders,
  isLoggedIn,
}: {
  userId: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
  isLoggedIn: boolean;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'friend'>('idle');

  const add = async () => {
    if (!isLoggedIn || state !== 'idle') return;
    setState('busy');
    const res = await requestFriend(getAuthHeaders, userId);
    if (res.ok) {
      setState(res.becameFriends ? 'friend' : 'sent');
      return;
    }
    if (res.error.includes('已经是好友')) setState('friend');
    else if (res.error.includes('申请已发出')) setState('sent');
    else setState('idle');
  };

  const label =
    state === 'friend'
      ? '已是好友'
      : state === 'sent'
        ? '已申请'
        : state === 'busy'
          ? '…'
          : '加好友';

  return (
    <button
      type="button"
      onClick={() => void add()}
      disabled={state !== 'idle' || !isLoggedIn}
      aria-label={isLoggedIn ? '加为好友' : '登录后可加好友'}
      className={cn(
        'inline-flex flex-none items-center gap-0.5 rounded-chip px-1.5 py-0.5 text-micro font-medium',
        'transition-colors duration-fast ease-apple',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40',
        state === 'idle'
          ? 'bg-apple-blue-soft text-apple-blue hover:bg-apple-blue/15'
          : 'bg-apple-bg text-apple-text-3',
      )}
    >
      {state === 'idle' && <UserPlus className="h-3 w-3" aria-hidden />}
      {label}
    </button>
  );
}

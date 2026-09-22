'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, ChevronLeft } from 'lucide-react';
import MessageInput from '@/components/chat/MessageInput';
import Avatar from '@/components/ui/Avatar';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  addBookmarkNote,
  fetchBookmarks,
  type BookmarkEntry,
} from '@/lib/community';
import '@/components/chat/Chat.css';

interface BookmarksThreadProps {
  getAuthHeaders: () => Promise<Record<string, string>>;
  onBack: () => void;
}

/**
 * 「我的收藏」—— 对话板块里和自己的一条会话（用户 2026-09-22 需求）。
 *
 * 用户的原话是"收藏的帖子会出现在对话中，以聊天气泡的形式出现"，
 * 所以这里刻意复用参考项目的 Chat 样式（气泡、列表、输入条），
 * 而不是另做一套卡片列表：
 *   · 自己写的备注 → 右侧橙色气泡（像自己发的消息）
 *   · 收藏的帖子   → 左侧白色气泡（像收到的消息），内含作者/正文/配图
 * 两者按时间排成一条线 —— 这正是"和自己对话"的语义。
 *
 * 输入框写下的是一句**备注**（post_id 为空），不挂任何帖子；
 * 要收藏帖子去「交流」板块点书签图标。
 */
export default function BookmarksThread({
  getAuthHeaders,
  onBack,
}: BookmarksThreadProps) {
  const [entries, setEntries] = useState<BookmarkEntry[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const list = await fetchBookmarks(getAuthHeaders);
    if (list) setEntries(list);
  }, [getAuthHeaders]);

  useEffect(() => {
    setEntries(null);
    void load();
  }, [load]);

  useEffect(() => {
    const el = listRef.current;
    if (el && entries) el.scrollTop = el.scrollHeight;
  }, [entries]);

  const handleSend = async (text: string) => {
    const content = text.trim();
    if (!content) return;

    // 乐观插入自己的备注，服务端返回后用真实行替换
    const tempId = `temp-${Date.now()}`;
    const optimistic: BookmarkEntry = {
      id: tempId,
      kind: 'note',
      content,
      created_at: new Date().toISOString(),
      post: null,
    };
    setEntries((prev) => [...(prev ?? []), optimistic]);

    const saved = await addBookmarkNote(getAuthHeaders, content);
    if (!saved) {
      setEntries((prev) => (prev ?? []).filter((e) => e.id !== tempId));
      return;
    }
    setEntries((prev) => [...(prev ?? []).filter((e) => e.id !== tempId), saved]);
  };

  const postCount = (entries ?? []).filter((e) => e.kind === 'post').length;

  return (
    <div className="chat-page fixed inset-0 z-sheet">
      <header className="chat-header">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回会话列表"
          className="-ml-1 inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-apple-text-2 transition-colors duration-fast ease-apple hover:text-apple-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>

        <div className="chat-header-avatar">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-apple-blue-soft">
            <Bookmark className="h-5 w-5 fill-current text-apple-blue" aria-hidden />
          </span>
        </div>

        <div className="chat-header-info min-w-0 flex-1">
          <h1 className="truncate">我的收藏</h1>
          <span>
            {entries === null
              ? '加载中…'
              : postCount > 0
                ? `收藏了 ${postCount} 条帖子`
                : '收藏的帖子都会到这里'}
          </span>
        </div>
      </header>

      <div ref={listRef} className="message-list">
        {entries === null ? (
          <p className="py-10 text-center text-sm text-apple-text-3">加载中…</p>
        ) : entries.length === 0 ? (
          <EmptyState />
        ) : (
          entries.map((e) =>
            e.kind === 'post' ? (
              <PostBubble key={e.id} entry={e} />
            ) : (
              <NoteBubble key={e.id} entry={e} />
            ),
          )
        )}
      </div>

      <MessageInput
        onSend={(text) => void handleSend(text)}
        onFocus={() => {}}
        onBlur={() => {}}
      />
    </div>
  );
}

/** 空态：说明这里是怎么用的，而不是干巴巴一句"暂无收藏" */
function EmptyState() {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-apple-blue-soft">
        <Bookmark className="h-6 w-6 text-apple-blue" aria-hidden />
      </span>
      <p className="mt-3 text-md font-medium text-apple-text">还没有收藏</p>
      <p className="mt-1 max-w-[300px] text-sm leading-relaxed text-apple-text-2">
        去「交流」板块点帖子上的书签图标，收藏的帖子会出现在这里。
        也可以直接在下面写点什么，这里是只属于你自己的空间。
      </p>
    </div>
  );
}

/** 收藏的帖子：左侧白色气泡（像"收到"的内容），点标题跳回原帖 */
function PostBubble({ entry }: { entry: BookmarkEntry }) {
  const post = entry.post;

  // 原帖被删：保留条目并说明，比让收藏凭空消失好
  if (!post) {
    return (
      <div className="message-row message-row-other">
        <div className="message-bubble message-bubble-other">
          <div className="message-content text-apple-text-3">
            原帖已删除
          </div>
          <div className="message-meta">
            <span>{timeAgo(entry.created_at)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="message-row message-row-other">
      <div className="message-bubble message-bubble-other">
        <div className="message-content">
          {/* 作者行 */}
          <span className="flex items-center gap-2">
            <Avatar
              avatarKey={post.author?.avatar_key}
              avatarUrl={post.author?.avatar_url}
              name={post.author?.display_name}
              size={22}
            />
            <span className="text-xs font-semibold text-apple-text">
              {post.author?.display_name ?? '用户'}
            </span>
          </span>

          {post.content && (
            <span className="mt-1.5 block whitespace-pre-wrap break-words">
              {post.content.length > 140
                ? `${post.content.slice(0, 140)}…`
                : post.content}
            </span>
          )}

          {post.images.length > 0 && (
            <span className="mt-2 flex gap-1.5">
              {post.images.slice(0, 3).map((url) => (
                // 气泡里的小缩略图，不做点击放大 —— 放大去原帖看
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt=""
                  loading="lazy"
                  className="h-16 w-16 rounded-input object-cover"
                />
              ))}
            </span>
          )}

          {/* 刻意用普通 <a> 而不是 next/link：已经在广场页时，Link 走 pushState
              只改地址栏、不触发 hashchange，交流板块的滚动逻辑就不会跑，
              点了像没反应。同文档导航才会触发 hashchange（且自身不刷新页面）。 */}
          <a
            href={`/community/plaza#post-${post.id}`}
            className={cn(
              'mt-2 inline-flex items-center gap-1 text-xs font-medium text-apple-blue',
              'transition-opacity duration-fast hover:opacity-80',
            )}
          >
            查看原帖 →
          </a>
        </div>

        <div className="message-meta">
          <span>{timeAgo(entry.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

/** 自己的备注：右侧橙色气泡（像自己发的消息） */
function NoteBubble({ entry }: { entry: BookmarkEntry }) {
  return (
    <div className="message-row message-row-mine">
      <div className="message-bubble message-bubble-mine">
        <div className="message-content">{entry.content}</div>
        <div className="message-meta">
          <span>{timeAgo(entry.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

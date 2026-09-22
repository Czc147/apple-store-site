'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  MessageSquare,
  Package,
  Search as SearchIcon,
  StickyNote,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import {
  EMPTY_RESULTS,
  countResults,
  search,
  type SearchResults,
} from '@/lib/search';
import { formatPrice, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';

/** 输入防抖：每敲一个字就发一次请求既费流量也费配额 */
const DEBOUNCE_MS = 320;

interface SearchPanelProps {
  onClose: () => void;
  /** 跳到别的板块（对话等），由广场外壳执行 */
  onGoBoard: (key: 'chat' | 'dm') => void;
}

/**
 * 全站搜索（用户需求：能搜交流的帖子、一起买的拼单、共享的交换、好友、聊天记录）。
 *
 * 拼单与共享两个板块还没建，等它们落地后在 /api/search 里各加一组即可，
 * 这里的分组渲染是数据驱动的，前端不用动。
 * 另外补了**用户**与**商品**两类 —— 全局搜索搜不到人和商品最奇怪。
 *
 * 隐私：聊天记录只搜当前用户参与的，接口层已经限定，前端不额外处理。
 */
export default function SearchPanel({ onClose, onGoBoard }: SearchPanelProps) {
  const { getAuthHeaders } = useAuth();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  /** 已经搜过一次（用于区分"还没搜"和"搜了但没结果"两种空态） */
  const [searched, setSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // 防抖搜索。用 AbortController 取消上一次：否则慢的那次回来会把
  // 快的那次结果覆盖掉，出现"打字停下后结果又跳回上一轮"
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults(EMPTY_RESULTS);
      setSearched(false);
      setFailed(false);
      setBusy(false);
      return;
    }

    setBusy(true);
    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const data = await search(getAuthHeaders, term, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setBusy(false);
      setSearched(true);
      if (!data) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setResults(data);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [q, getAuthHeaders]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const total = countResults(results);
  const hasQuery = q.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-sheet flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="搜索"
    >
      {/* 遮罩只负责视觉：它是 absolute，而下面的内容列是 relative 且 h-full，
          会把整个屏幕盖住 —— 点击永远落不到遮罩上，所以"点空白关闭"一直不生效。
          改成把关闭挂在**内容列自身**上，只在点到列本身（而非它的子元素）时关。 */}
      <div className="scrim-sheet pointer-events-none absolute inset-0 animate-fade-in" aria-hidden />

      <div
        className="relative flex h-full flex-col overflow-y-auto overscroll-contain px-page pb-[calc(var(--plaza-bar-h)+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+16px)]"
        onClick={(e) => {
          // 只有点在列本身才算"点空白"：点结果、点输入框都不该关
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="mx-auto w-full max-w-wide">
          {/* 搜索框 */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <SearchIcon
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-apple-text-3"
                aria-hidden
              />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onClose();
                }}
                aria-label="搜索全站内容"
                placeholder="搜索帖子、商品、好友与聊天记录"
                className="h-12 w-full rounded-btn border border-apple-border bg-apple-card pl-10 pr-4 text-md text-apple-text shadow-card outline-none placeholder:text-apple-text-3 focus:ring-2 focus:ring-apple-blue/35"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭搜索"
              className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-full text-apple-text-2 transition-colors duration-fast ease-apple hover:text-apple-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {/* 结果 */}
          <div className="mt-4 space-y-5 pb-6">
            {!hasQuery && <Hint />}

            {hasQuery && busy && (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-apple-text-3">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                搜索中…
              </p>
            )}

            {hasQuery && !busy && failed && (
              <p className="rounded-card-lg bg-apple-card px-5 py-8 text-center text-sm text-apple-danger shadow-card">
                搜索失败，请稍后再试
              </p>
            )}

            {hasQuery && !busy && !failed && searched && total === 0 && (
              <p className="rounded-card-lg bg-apple-card px-5 py-8 text-center text-sm text-apple-text-2 shadow-card">
                没有找到「{results.q}」相关的内容
              </p>
            )}

            {hasQuery && !busy && !failed && results.messages.length > 0 && (
              <Group icon={MessageSquare} title="聊天记录" count={results.messages.length}>
                {results.messages.map((m) => (
                  <Row key={m.id} onClick={() => onGoBoard('dm')}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-md font-medium text-apple-text">
                          {m.peer_name}
                        </span>
                        {m.mine && (
                          <Badge tone="neutral" size="sm">
                            我发的
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-apple-text-2">
                        {m.content}
                      </span>
                    </span>
                    <span className="flex-none text-2xs text-apple-text-3">
                      {timeAgo(m.created_at)}
                    </span>
                  </Row>
                ))}
              </Group>
            )}

            {hasQuery && !busy && !failed && results.posts.length > 0 && (
              <Group icon={StickyNote} title="帖子" count={results.posts.length}>
                {results.posts.map((p) => (
                  <Row
                    key={p.id}
                    onClick={() => {
                      window.location.href = `/community/plaza#post-${p.id}`;
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-md font-medium text-apple-text">
                          {p.author?.display_name ?? 'Zorvin 官方'}
                        </span>
                        {p.is_pinned && (
                          <Badge tone="blue" size="sm">
                            置顶
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-apple-text-2">
                        {p.content}
                      </span>
                    </span>
                  </Row>
                ))}
              </Group>
            )}

            {hasQuery && !busy && !failed && results.products.length > 0 && (
              <Group icon={Package} title="商品" count={results.products.length}>
                {results.products.map((p) => (
                  <Row
                    key={`${p.kind}-${p.id}`}
                    onClick={() => {
                      window.location.href = '/';
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="truncate text-md font-medium text-apple-text">
                        {p.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-apple-text-3">
                        {p.kind === 'major' ? '大单元' : '小单元'}
                      </span>
                    </span>
                    {p.price !== null && (
                      <span className="flex-none text-sm tabular-nums text-apple-text-2">
                        {formatPrice(p.price)}
                      </span>
                    )}
                  </Row>
                ))}
              </Group>
            )}

            {hasQuery && !busy && !failed && results.users.length > 0 && (
              <Group icon={User} title="用户" count={results.users.length}>
                {results.users.map((u) => (
                  <Row key={u.user_id} onClick={() => onGoBoard('dm')}>
                    <Avatar
                      avatarKey={u.avatar_key}
                      avatarUrl={u.avatar_url}
                      name={u.display_name}
                      size={36}
                    />
                    <span className="min-w-0 flex-1 truncate text-md font-medium text-apple-text">
                      {u.display_name}
                      {u.is_me && (
                        <span className="ml-1.5 text-2xs text-apple-text-3">（我）</span>
                      )}
                    </span>
                  </Row>
                ))}
              </Group>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Hint() {
  return (
    <div className="rounded-card-lg bg-apple-card px-5 py-8 text-center shadow-card">
      <SearchIcon className="mx-auto h-6 w-6 text-apple-text-3" aria-hidden />
      <p className="mt-3 text-sm font-medium text-apple-text">搜点什么</p>
      <p className="mx-auto mt-1 max-w-[320px] text-xs leading-relaxed text-apple-text-2">
        帖子、商品、好友、聊天记录都能搜。聊天记录只搜你自己的，别人的私信搜不到。
      </p>
    </div>
  );
}

function Group({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof User;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold text-apple-text-3">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {title}
        <span className="tabular-nums">· {count}</span>
      </h2>
      <div className="divide-y divide-apple-hairline overflow-hidden rounded-card-lg bg-apple-card shadow-card">
        {children}
      </div>
    </section>
  );
}

function Row({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-left',
        'transition-colors duration-fast ease-apple hover:bg-apple-bg active:bg-apple-bg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-apple-blue/40',
      )}
    >
      {children}
    </button>
  );
}

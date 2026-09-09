'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, Inbox, X } from 'lucide-react';
import type { Notification } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { timeAgo } from '@/lib/format';
import EmptyState from '@/components/ui/EmptyState';
import IconButton from '@/components/ui/IconButton';

function panelBody(item: Notification): string {
  return item.body ?? item.title ?? '新通知';
}

/**
 * 通知铃（「我的库」账号条右侧）：
 * - 轮询 /api/notifications，未读数角标
 * - 点开面板：未读高亮 + 全部已读；点单条标记已读并按 payload.url 跳转
 */
export default function NotificationBell() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setUnread(0);
      return;
    }
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) return;
      const res = await fetch('/api/notifications', { headers });
      if (!res.ok) return;
      const data = (await res.json()) as { items: Notification[]; unread_count: number };
      setItems(Array.isArray(data.items) ? data.items : []);
      setUnread(typeof data.unread_count === 'number' ? data.unread_count : 0);
    } catch {
      /* 静默，下次轮询重试 */
    }
  }, [user, getAuthHeaders]);

  useEffect(() => {
    void load();
    timer.current = window.setInterval(() => void load(), 30000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [load]);

  useEffect(() => {
    // 面板打开时关闭外部点击
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const markRead = async (n: Notification) => {
    if (n.read_at) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/notifications/${n.id}/read`, {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        setItems((list) =>
          list.map((x) =>
            x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x,
          ),
        );
        setUnread((u) => Math.max(0, u - 1));
      }
    } catch {
      /* 忽略 */
    }
  };

  const markAll = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        setItems((list) => list.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
        setUnread(0);
      }
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const handleOpen = (n: Notification) => {
    void markRead(n);
    const url = n.payload?.url;
    if (typeof url === 'string' && url) router.push(url);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `通知（${unread} 条未读）` : '通知'}
        aria-expanded={open}
        className="relative -my-1 inline-flex h-11 w-11 items-center justify-center rounded-full text-apple-text-2 transition-colors duration-fast ease-apple hover:bg-apple-bg hover:text-apple-text active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-apple-danger px-1 text-micro font-semibold leading-none text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          // audit 修复：原 w-[320px] 固定宽在 320-360px 视口横向溢出；
          // 阴影改走 shadow-popover token（原 shadow-lg shadow-black/10 自成一套）；
          // 面板开合从零动画 → pop-in（fade+scale，锚点右上）
          className="animate-pop-in absolute right-0 top-12 z-panel w-[min(320px,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-card-lg border border-apple-border bg-white shadow-popover"
        >
          <div className="flex items-center justify-between border-b border-apple-hairline bg-apple-bg/50 px-4 py-1.5">
            <p className="text-sm font-semibold text-apple-text">通知</p>
            <div className="flex items-center">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void markAll()}
                  disabled={loading}
                  className="-my-1.5 inline-flex min-h-11 items-center gap-1 rounded-btn px-2 text-2xs font-medium text-apple-blue transition-colors duration-fast ease-apple hover:bg-apple-blue-soft active:scale-[0.97] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
                >
                  <Check className="h-3 w-3" aria-hidden />
                  全部已读
                </button>
              )}
              <IconButton
                icon={X}
                label="关闭"
                onClick={() => setOpen(false)}
                className="-mr-2.5 -my-1.5"
              />
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {items.length === 0 ? (
              <EmptyState
                icon={Inbox}
                size="panel"
                title="暂无通知"
                description="订阅内容更新、解锁成功会第一时间通知你"
                className="pb-8 pt-6"
              />
            ) : (
              <ul className="divide-y divide-apple-hairline">
                {items.map((n) => {
                  const isRead = Boolean(n.read_at);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleOpen(n)}
                        className={`w-full px-4 py-3 text-left transition-colors duration-fast ease-apple hover:bg-apple-bg/60 active:bg-apple-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-apple-blue/40 ${
                          isRead ? 'opacity-70' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {!isRead && (
                            <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-apple-blue" aria-hidden />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-apple-text">
                              {n.title ?? '通知'}
                            </p>
                            <p className="mt-0.5 text-xs leading-relaxed text-apple-text-2">
                              {panelBody(n)}
                            </p>
                            <p className="mt-1 text-2xs text-apple-text-3">
                              {timeAgo(n.created_at)}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

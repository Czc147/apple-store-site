'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Bell, Check, Inbox, X } from 'lucide-react';
import type { Notification } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useNotifications } from '@/lib/notifications-store';
import { timeAgo } from '@/lib/format';
import EmptyState from '@/components/ui/EmptyState';
import IconButton from '@/components/ui/IconButton';

function panelBody(item: Notification): string {
  return item.body ?? item.title ?? '新通知';
}

/**
 * 通知铃（「我的库」账号条右侧）：
 * - 数据与轮询全部走 lib/notifications-store（与底部导航「我的库」角标同源，
 *   登录态全局只有一个 30s 轮询；本组件只做展示与交互）
 * - 点开面板：未读高亮 + 全部已读；点单条标记已读并按 payload.url 跳转
 * - 读通知后 store 立即更新未读数 → 底部导航角标同步消
 */
export default function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const { items, unread, busy, markRead, markAllRead } = useNotifications();

  const [open, setOpen] = useState(false);
  /** 面板走 Portal 挂到 body 上，位置按铃铛算（见下方注释） */
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  /**
   * 把面板贴在铃铛正下方；窗口尺寸/滚动变化时重算。
   *
   * 宽度公式必须和面板 class 里的 `w-[min(320px,calc(100vw-2rem))]` 一致 ——
   * 这里要拿它算夹取边界。**不能只按铃铛右缘对齐**：铃铛右边还有「退出」按钮，
   * 它离屏幕右缘有 100 多像素，320px 的面板右对齐过去会从左边溢出
   * （实测 320px 宽屏溢出 85px）。所以按铃铛算完再夹一次，宁可整体左移。
   */
  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const width = Math.min(320, vw - 32);
    const preferred = vw - r.right;              // 右对齐铃铛
    const maxAllowed = vw - 16 - width;          // 再往右就会从左边越界
    setPos({ top: r.bottom + 8, right: Math.max(8, Math.min(preferred, maxAllowed)) });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place);
    // capture=true：页面里任何容器滚动都要跟着走，否则面板会飘在错误的位置
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  useEffect(() => {
    // 面板打开时关闭外部点击。
    // 铃铛自己也算「内部」—— 否则再点一下铃铛会先被这里关掉、
    // 紧接着 onClick 又把它打开，结果是永远关不上。
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!user) return null;

  const handleOpen = (n: Notification) => {
    void markRead(n.id);
    const url = n.payload?.url;
    if (typeof url === 'string' && url) router.push(url);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `通知（${unread} 条未读）` : '通知'}
        aria-expanded={open}
        className="relative -my-1 inline-flex h-11 w-11 items-center justify-center rounded-full text-apple-text-2 pressable-soft hover:bg-apple-bg hover:text-apple-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {/* 角标定位在**图标本体**的右上角，不是 44px 命中区的外角。
            原来写的是 -right-0.5 -top-0.5（命中区外角），而图标只有 18px、
            居中在 44px 里 —— 于是角标离铃铛有 7px 空隙，看起来是个红球浮在旁边，
            而且 16px 的角标几乎和图标一样大（用户报的"铃按钮显示有问题"）。
            现在图标 20px、角标 15px 压在图标右上角上，两者不再分家。 */}
        {unread > 0 && (
          <span className="absolute right-[3px] top-[3px] flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-apple-danger px-[3px] text-micro font-semibold leading-none text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* 面板必须挂到 body 上（Portal）而不是留在原地：
          账户卡是 GlassSurface，带 overflow-hidden（为了裁内部的毛玻璃色斑），
          面板 absolute 在卡片里会被**裁得只剩几个像素** —— 实测点开后只有
          一条细边露出来，看起来就是"点了没反应"。
          Portal + fixed 定位，坐标按铃铛实时算。 */}
      {open && mounted && pos && createPortal(
        <div
          ref={panelRef}
          style={{ top: pos.top, right: pos.right }}
          // audit 修复：原 w-[320px] 固定宽在 320-360px 视口横向溢出；
          // 阴影改走 shadow-popover token（原 shadow-lg shadow-black/10 自成一套）；
          // 面板开合从零动画 → pop-in（fade+scale，锚点右上）
          className="animate-pop-in fixed z-panel w-[min(320px,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-card-lg border border-apple-border bg-apple-card shadow-popover"
        >
          <div className="flex items-center justify-between border-b border-apple-hairline bg-apple-bg/50 px-4 py-1.5">
            <p className="text-sm font-semibold text-apple-text">通知</p>
            <div className="flex items-center">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={busy}
                  className="-my-1.5 inline-flex min-h-11 items-center gap-1 rounded-btn px-2 text-2xs font-medium text-apple-blue pressable hover:bg-apple-blue-soft disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
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
        </div>,
        document.body,
      )}
    </div>
  );
}

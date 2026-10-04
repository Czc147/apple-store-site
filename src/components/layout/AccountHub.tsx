'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronRight,
  Gift,
  Headphones,
  LibraryBig,
  LogOut,
  Package,
  Receipt,
  RefreshCw,
  Settings,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useNotifications } from '@/lib/notifications-store';
import { useDmUnread } from '@/lib/dm-unread-store';
import { formatPrice, timeAgo } from '@/lib/format';
import Avatar from '@/components/ui/Avatar';
import CountBadge from '@/components/ui/CountBadge';

interface AccountSummary {
  profile: {
    display_name: string | null;
    avatar_key: string | null;
    avatar_url: string | null;
  };
  email: string | null;
  stats: {
    contents: number;
    subscriptions: number;
    orders: number;
    coupons: number;
  };
  recent_orders: Array<{
    id: string;
    order_no: string;
    status: string;
    payable: number;
    created_at: string;
  }>;
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: '待确认',
  paid: '已确认',
  canceled: '已取消',
};

/**
 * 全局账号中枢：右上角头像 + 右侧抽屉。
 * 底部导航只保留四个主场景，账号、探究和我的库统一从这里进出。
 */
export default function AccountHub() {
  const { user, loading, configured, getAuthHeaders, signOut } = useAuth();
  const { unread } = useNotifications();
  const { unread: dmUnread } = useDmUnread();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const unreadTotal = unread + dmUnread;
  const displayName =
    summary?.profile.display_name ?? user?.email ?? (loading ? '正在读取账号…' : '游客');

  const loadSummary = useCallback(async () => {
    if (!user) {
      setSummary(null);
      return;
    }
    setSummaryLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/account', { headers });
      if (res.ok) setSummary((await res.json()) as AccountSummary);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [getAuthHeaders, user]);

  const openHub = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setClosing(false);
    setOpen(true);
  }, []);

  const closeHub = useCallback(() => {
    if (!open || closing) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      closeTimerRef.current = null;
    }, 280);
  }, [open, closing]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const closeHubRef = useRef(closeHub);
  useEffect(() => {
    closeHubRef.current = closeHub;
  }, [closeHub]);

  useEffect(() => {
    closeHubRef.current();
  }, [pathname]);

  useEffect(() => {
    if (!open || !user || summary) return;
    void loadSummary();
  }, [open, user, summary, loadSummary]);

  useEffect(() => {
    if (loading || !user) return;
    void loadSummary();
  }, [loading, user?.id, loadSummary]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeHub();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, closeHub]);

  useEffect(() => {
    document.body.classList.toggle('account-hub-open', open);
    return () => {
      document.body.classList.remove('account-hub-open');
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={openHub}
        aria-label="打开账号中心"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed right-3 top-[calc(env(safe-area-inset-top)+0.625rem)] z-40 flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-white/65 shadow-popover backdrop-blur-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40 active:scale-95"
      >
        <span className="relative">
          <Avatar
            avatarKey={summary?.profile.avatar_key}
            avatarUrl={summary?.profile.avatar_url}
            name={displayName}
            size={36}
          />
          <CountBadge count={unreadTotal} className="-right-3 -top-1" />
        </span>
      </button>

      {open && (
        <div
          role="presentation"
          className={`fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] ${
            closing ? 'account-scrim-out' : 'account-scrim-in'
          }`}
          onClick={closeHub}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-hub-title"
            aria-hidden={closing}
            className={`account-drawer absolute inset-y-0 right-0 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col ${
              closing ? 'account-drawer-out' : 'account-drawer-in'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-apple-hairline px-4 py-3">
              <div>
                <p id="account-hub-title" className="text-lg font-semibold text-apple-text">
                  账号中心
                </p>
                <p className="text-xs text-apple-text-3">个人内容与偏好入口</p>
              </div>
              <button
                type="button"
                onClick={closeHub}
                aria-label="关闭账号中心"
                className="flex h-10 w-10 items-center justify-center rounded-full text-apple-text-2 transition hover:bg-apple-bg active:scale-95"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-5">
              <section
                className="account-item mb-6 rounded-hero bg-apple-surface p-4"
                style={{ animationDelay: '70ms' }}
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    avatarKey={summary?.profile.avatar_key}
                    avatarUrl={summary?.profile.avatar_url}
                    name={displayName}
                    size={52}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-apple-text">
                      {displayName}
                    </p>
                    <p className="truncate text-xs text-apple-text-3">
                      {user?.email ?? '登录后同步你的内容'}
                    </p>
                  </div>
                </div>

                {loading || summaryLoading ? (
                  <div className="mt-4 h-4 w-32 rounded-full bg-apple-bg" />
                ) : user ? (
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-apple-danger transition hover:opacity-80"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    退出登录
                  </button>
                ) : configured ? (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Link
                      href="/login"
                      className="inline-flex h-10 items-center justify-center rounded-btn bg-apple-blue text-sm font-medium text-white transition active:scale-95"
                    >
                      登录
                    </Link>
                    <Link
                      href="/login?mode=register"
                      className="inline-flex h-10 items-center justify-center rounded-btn border border-apple-border bg-white text-sm font-medium text-apple-text transition active:scale-95"
                    >
                      注册
                    </Link>
                  </div>
                ) : (
                  <p className="mt-3 text-xs leading-relaxed text-apple-text-3">
                    登录服务暂未配置，当前为演示模式。
                  </p>
                )}
              </section>

              <section
                aria-label="快捷入口"
                className="account-item mb-7"
                style={{ animationDelay: '120ms' }}
              >
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-apple-text-3">
                  快捷入口
                </h2>
                <div className="space-y-1">
                  <DrawerLink href="/referrals" icon={Gift} label="推广计划" variant="referral" />
                  <DrawerLink href="/community/plaza" icon={Users} label="探究广场" />
                  <DrawerLink href="/library#profile" icon={Settings} label="账号设置" />
                  <DrawerLink href="/community/plaza#dm" icon={Headphones} label="客服" />
                </div>
              </section>

              <section
                aria-label="我的库"
                className="account-item"
                style={{ animationDelay: '170ms' }}
              >
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-apple-text-3">
                  我的库
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  <LibraryTile
                    href="/library#contents"
                    icon={Package}
                    label="已购内容"
                    value={summary?.stats.contents ?? 0}
                  />
                  <LibraryTile
                    href="/library#subscriptions"
                    icon={RefreshCw}
                    label="我的订阅"
                    value={summary?.stats.subscriptions ?? 0}
                  />
                  <LibraryTile
                    href="/library#orders"
                    icon={Receipt}
                    label="订单"
                    value={summary?.stats.orders ?? 0}
                  />
                  <LibraryTile
                    href="/library#coupons"
                    icon={Ticket}
                    label="优惠券"
                    value={summary?.stats.coupons ?? 0}
                  />
                </div>
              </section>

              {summary?.recent_orders.length ? (
                <section
                  aria-label="最近订单"
                  className="account-item mt-7"
                  style={{ animationDelay: '220ms' }}
                >
                  <h2 className="mb-2 text-xs font-semibold tracking-wide text-apple-text-3">
                    最近订单
                  </h2>
                  <div className="rounded-card border border-apple-border bg-white">
                    {summary.recent_orders.map((order, index) => (
                      <div
                        key={order.id}
                        className={`flex items-center justify-between gap-3 px-3 py-3 ${
                          index > 0 ? 'border-t border-apple-hairline' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs text-apple-text-2">
                            {order.order_no}
                          </p>
                          <p className="text-2xs text-apple-text-3">
                            {timeAgo(order.created_at)} ·{' '}
                            {ORDER_STATUS_LABEL[order.status] ?? order.status}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatPrice(order.payable)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {user ? (
                <Link
                  href="/library"
                  className="mt-6 flex h-11 items-center justify-between rounded-btn border border-apple-border bg-white px-4 text-sm font-medium text-apple-text transition active:scale-[0.98]"
                >
                  <span className="flex items-center gap-2">
                    <LibraryBig className="h-4 w-4 text-apple-text-2" aria-hidden />
                    查看完整我的库
                  </span>
                  <ChevronRight className="h-4 w-4 text-apple-text-3" aria-hidden />
                </Link>
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function DrawerLink({
  href,
  icon: Icon,
  label,
  variant = 'default',
}: {
  href: string;
  icon: typeof Users;
  label: string;
  variant?: 'default' | 'referral';
}) {
  return (
    <Link
      href={href}
      className={
        variant === 'referral'
          ? 'referral-rainbow-button flex h-11 items-center justify-between rounded-btn px-4 text-sm font-medium text-white transition active:scale-[0.98]'
          : 'flex h-11 items-center justify-between rounded-btn border border-apple-border bg-white px-4 text-sm font-medium text-apple-text transition hover:bg-apple-bg active:scale-[0.98]'
      }
    >
      <span className="flex items-center gap-2">
        <Icon
          className={variant === 'referral' ? 'h-4 w-4 text-white/85' : 'h-4 w-4 text-apple-text-2'}
          aria-hidden
        />
        {label}
      </span>
      <ChevronRight
        className={variant === 'referral' ? 'h-4 w-4 text-white/70' : 'h-4 w-4 text-apple-text-3'}
        aria-hidden
      />
    </Link>
  );
}

function LibraryTile({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[4.25rem] flex-col justify-between rounded-card border border-apple-border bg-white p-3 transition hover:border-apple-blue/40 hover:bg-apple-blue/5 active:scale-[0.98]"
    >
      <Icon className="h-4 w-4 text-apple-text-2" aria-hidden />
      <span className="flex items-baseline justify-between">
        <span className="text-xs text-apple-text-2">{label}</span>
        <span className="text-lg font-semibold tabular-nums">{value}</span>
      </span>
    </Link>
  );
}

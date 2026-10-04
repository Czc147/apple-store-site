'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CalendarDays,
  ChevronDown,
  CreditCard,
  ExternalLink,
  FolderUp,
  Gauge,
  KeyRound,
  Layers,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Receipt,
  Flag,
  Gift,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trash2,
  Truck,
  Upload,
  Users,
  UserRound,
  X,
} from 'lucide-react';
import PageFade from '@/components/ui/PageFade';

type NavItem = { href: string; label: string; icon: typeof Boxes };
type NavGroup = { id: string; title: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    title: '概览',
    items: [{ href: '/admin/stats', label: '数据中心', icon: BarChart3 }],
  },
  {
    id: 'content',
    title: '内容管理',
    items: [
      { href: '/admin/major-units', label: '大单元', icon: Boxes },
      { href: '/admin/sub-units', label: '小单元', icon: Package },
      { href: '/admin/activities', label: '活动管理', icon: CalendarDays },
      { href: '/admin/bulk-import', label: '文件夹导入', icon: FolderUp },
      { href: '/admin/home-sections', label: '首页装修', icon: LayoutDashboard },
      { href: '/admin/prelaunch', label: '预上线', icon: CalendarDays },
      // 「每日推荐」(/admin/daily-picks) 故意不进菜单：2026-10-04 线上 daily_picks 0 行，
      // 前台也没有入口。页面与接口先留着（等确认整体下线再删），别再把它加回菜单。
    ],
  },
  {
    id: 'trade',
    title: '交易管理',
    items: [
      { href: '/admin/orders', label: '订单', icon: Receipt },
      { href: '/admin/coupons', label: '优惠券', icon: Ticket },
      { href: '/admin/subscriptions', label: '订阅', icon: CreditCard },
      { href: '/admin/subscription-repos', label: '订阅仓库', icon: Sparkles },
      { href: '/admin/card-management', label: '发卡概览', icon: Gauge },
      { href: '/admin/card-management/products', label: '卡密商品', icon: Layers },
      { href: '/admin/card-management/keys', label: '卡密库存', icon: KeyRound },
      { href: '/admin/card-management/keys/import', label: '批量导入', icon: Upload },
      { href: '/admin/card-management/deliveries', label: '发货记录', icon: Truck },
    ],
  },
  {
    id: 'users',
    title: '用户与风控',
    items: [
      { href: '/admin/users', label: '账号管理', icon: UserRound },
      { href: '/admin/referrals', label: '推广计划', icon: Gift },
      { href: '/admin/library', label: '用户权益', icon: LibraryBig },
      { href: '/admin/messages', label: '留言', icon: MessageSquare },
    ],
  },
  {
    id: 'community',
    title: '社区',
    items: [
      { href: '/admin/community', label: '探究', icon: Users },
      { href: '/admin/reports', label: '举报', icon: Flag },
      { href: '/admin/share-exchanges', label: '共享审核', icon: ArrowLeftRight },
    ],
  },
  {
    id: 'system',
    title: '系统',
    items: [
      { href: '/admin/app-settings', label: '全局配置', icon: Settings },
      { href: '/admin/push', label: '推送服务', icon: Send },
      { href: '/admin/storage-cleanup', label: '存储清理', icon: Trash2 },
    ],
  },
];

const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/**
 * 后台框架：
 * - 桌面：左侧固定分组导航
 * - 移动端：菜单按钮 + 右侧液态玻璃抽屉，替代原先的横向平铺
 */
export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>(['overview']);
  const closeTimerRef = useRef<number | null>(null);

  const closeMenu = () => {
    if (!menuOpen || menuClosing) return;
    setMenuClosing(true);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setMenuOpen(false);
      setMenuClosing(false);
    }, 280);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* 退出接口失败也强制回登录页 */
    }
    window.location.href = '/admin/login';
  };

  const activeHref = useMemo(() => {
    let best = '';
    for (const { href } of NAV_ITEMS) {
      if (pathname.startsWith(href) && href.length > best.length) best = href;
    }
    return best;
  }, [pathname]);

  const activeGroupId = useMemo(() => {
    for (const group of NAV_GROUPS) {
      if (group.items.some(({ href }) => pathname.startsWith(href))) return group.id;
    }
    return 'overview';
  }, [pathname]);

  useEffect(() => {
    setOpenGroups((previous) =>
      previous.includes(activeGroupId) ? previous : [...previous, activeGroupId],
    );
  }, [activeGroupId]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups((previous) =>
      previous.includes(groupId)
        ? previous.filter((id) => id !== groupId)
        : [...previous, groupId],
    );
  };

  const itemCls = (href: string) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium transition ${
      activeHref === href
        ? 'bg-apple-blue-soft text-apple-blue'
        : 'text-apple-text-2 hover:bg-apple-bg hover:text-apple-text'
    }`;

  const navGroups = (
    <div className="flex flex-col gap-5">
      {NAV_GROUPS.map((group) => {
        const isOpen = openGroups.includes(group.id);
        return (
          <div key={group.id} className="flex flex-col">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              aria-expanded={isOpen}
              aria-controls={`admin-group-${group.id}`}
              className="flex h-10 items-center justify-between rounded-xl px-3 text-left text-[12px] font-semibold tracking-wide text-apple-text-3 transition hover:bg-apple-bg hover:text-apple-text-2 active:scale-[0.99]"
            >
              <span>{group.title}</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-300 ease-out ${
                  isOpen ? 'rotate-180' : ''
                }`}
                aria-hidden
              />
            </button>
            <div
              id={`admin-group-${group.id}`}
              className={`admin-submenu ${isOpen ? 'open' : ''}`}
            >
              <div className="flex flex-col gap-1 pt-1">
                {group.items.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} className={itemCls(href)} onClick={closeMenu}>
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-apple-bg">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-apple-hairline bg-apple-surface px-4 py-6 md:flex">
        <div className="flex items-center gap-2 px-2 text-[16px] font-bold text-apple-text">
          <ShieldCheck className="h-5 w-5 text-apple-blue" aria-hidden />
          Zorvin 管理后台
        </div>

        <nav className="mt-7 flex-1 overflow-y-auto pb-2" aria-label="后台导航">
          {navGroups}
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-apple-hairline pt-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium text-apple-text-2 transition hover:bg-apple-bg hover:text-apple-text"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            查看站点
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] font-medium text-apple-text-2 transition hover:bg-apple-bg hover:text-apple-danger disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            {loggingOut ? '退出中…' : '退出登录'}
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-apple-hairline bg-apple-surface/90 pt-safe backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 pb-3 pt-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="打开后台导航"
                aria-expanded={menuOpen}
                aria-controls="admin-mobile-nav"
                className="flex h-9 w-9 items-center justify-center rounded-full text-apple-text transition hover:bg-apple-bg active:scale-[0.96]"
              >
                <Menu className="h-5 w-5" aria-hidden />
              </button>
              <div className="flex items-center gap-1.5 text-[15px] font-bold text-apple-text">
                <ShieldCheck className="h-4 w-4 text-apple-blue" aria-hidden />
                Zorvin 后台
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                aria-label="查看站点"
                className="flex h-9 w-9 items-center justify-center rounded-full text-apple-text-2 transition hover:bg-apple-bg"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                aria-label="退出登录"
                className="flex h-9 w-9 items-center justify-center rounded-full text-apple-text-2 transition hover:bg-apple-bg disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </header>

        {menuOpen && (
          <div className="fixed inset-0 z-50 md:hidden" role="presentation">
            <button
              type="button"
              onClick={closeMenu}
              aria-label="关闭后台导航"
              className={`absolute inset-0 bg-apple-scrim ${menuClosing ? 'account-scrim-out' : 'account-scrim-in'}`}
            />
            <div
              id="admin-mobile-nav"
              role="dialog"
              aria-modal="true"
              aria-label="后台导航"
              className={`account-drawer ${
                menuClosing ? 'account-drawer-out' : 'account-drawer-in'
              } inset-y-0 right-0 flex w-[86vw] max-w-xs flex-col px-4 pb-5 pt-4`}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[15px] font-bold text-apple-text">
                  <ShieldCheck className="h-4 w-4 text-apple-blue" aria-hidden />
                  Zorvin 管理后台
                </div>
                <button
                  type="button"
                  onClick={closeMenu}
                  aria-label="关闭导航"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-apple-text-2 transition hover:bg-apple-bg active:scale-[0.96]"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto" aria-label="后台分组导航">
                {navGroups}
              </nav>

              <div className="mt-4 flex flex-col gap-1 border-t border-apple-hairline pt-4">
                <Link
                  href="/"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium text-apple-text-2 transition hover:bg-apple-bg hover:text-apple-text"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  查看站点
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] font-medium text-apple-text-2 transition hover:bg-apple-bg hover:text-apple-danger disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  {loggingOut ? '退出中…' : '退出登录'}
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
          <PageFade>{children}</PageFade>
        </main>
      </div>
    </div>
  );
}

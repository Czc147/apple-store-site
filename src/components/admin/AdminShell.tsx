'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import PageFade from '@/components/ui/PageFade';
import {
  Boxes,
  CalendarDays,
  CreditCard,
  ExternalLink,
  LogOut,
  Package,
  ShieldCheck,
} from 'lucide-react';

const NAV = [
  { href: '/admin/major-units', label: '大单元管理', icon: Boxes },
  { href: '/admin/sub-units', label: '小单元管理', icon: Package },
  { href: '/admin/activities', label: '活动管理', icon: CalendarDays },
  { href: '/admin/subscriptions', label: '订阅管理', icon: CreditCard },
];

/**
 * 后台框架：
 * - PC（≥md）：左侧固定侧边栏导航
 * - 移动端：顶部标题栏 + 横向滚动 Tab
 * - 底部/侧栏内提供「查看站点」与「退出登录」
 */
export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

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

  const itemCls = (href: string) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium transition ${
      pathname.startsWith(href)
        ? 'bg-apple-blue-soft text-apple-blue'
        : 'text-apple-text-2 hover:bg-apple-bg hover:text-apple-text'
    }`;

  return (
    <div className="flex min-h-dvh bg-apple-bg">
      {/* 桌面侧边栏 */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-apple-hairline bg-apple-surface px-4 py-6 md:flex">
        <div className="flex items-center gap-2 px-2 text-[16px] font-bold text-apple-text">
          <ShieldCheck className="h-5 w-5 text-apple-blue" aria-hidden />
          管理后台
        </div>

        <nav className="mt-8 flex flex-col gap-1" aria-label="后台导航">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={itemCls(href)}>
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </Link>
          ))}
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
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] font-medium text-apple-text-2 transition hover:bg-apple-bg hover:text-[#D70015] disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            {loggingOut ? '退出中…' : '退出登录'}
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* 移动端顶栏（含刘海屏顶部安全区） */}
        <header className="sticky top-0 z-30 border-b border-apple-hairline bg-apple-surface/90 backdrop-blur pt-safe md:hidden">
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <div className="flex items-center gap-1.5 text-[15px] font-bold text-apple-text">
              <ShieldCheck className="h-4 w-4 text-apple-blue" aria-hidden />
              管理后台
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/"
                aria-label="查看站点"
                className="flex h-8 w-8 items-center justify-center rounded-full text-apple-text-2 transition hover:bg-apple-bg"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                aria-label="退出登录"
                className="flex h-8 w-8 items-center justify-center rounded-full text-apple-text-2 transition hover:bg-apple-bg disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
          <nav
            className="flex gap-2 overflow-x-auto px-4 pb-3 pt-1"
            aria-label="后台导航"
          >
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                  pathname.startsWith(href)
                    ? 'bg-apple-blue text-white'
                    : 'bg-apple-bg text-apple-text-2'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
          <PageFade>{children}</PageFade>
        </main>
      </div>
    </div>
  );
}

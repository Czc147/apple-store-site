'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShoppingBag,
  Heart,
  CalendarDays,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { useWishlist } from '@/lib/wishlist';

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** 底部 4 个 Tab：选购 / 愿望单 / 活动 / 订阅 */
const TABS: Tab[] = [
  { href: '/', label: '选购', icon: ShoppingBag },
  { href: '/wishlist', label: '愿望单', icon: Heart },
  { href: '/activities', label: '活动', icon: CalendarDays },
  { href: '/subscription', label: '订阅', icon: RefreshCw },
];

/**
 * Apple Store 风格底部导航栏：
 * 毛玻璃背景 + 发丝顶边 + 图标文字上下排列；
 * 选中态品牌蓝，未选中态灰色；愿望单图标右上角显示收藏数量角标。
 */
export default function TabBar() {
  const pathname = usePathname();
  const { count } = useWishlist();

  // 角标依赖 localStorage，仅在客户端挂载后显示，避免 SSR 水合不一致
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-apple-hairline glass shadow-tabbar"
    >
      <div className="mx-auto flex max-w-page items-stretch pb-safe">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex flex-1 flex-col items-center gap-[3px] pb-1.5 pt-2',
                'text-[10px] font-medium tracking-wide',
                'transition-[color,transform] duration-200 ease-apple active:scale-95',
                active ? 'text-apple-blue' : 'text-apple-text-3',
              ].join(' ')}
            >
              <span className="relative">
                <Icon
                  className="h-[22px] w-[22px]"
                  strokeWidth={active ? 2.1 : 1.7}
                  aria-hidden
                />
                {href === '/wishlist' && mounted && count > 0 && (
                  <span
                    key={count}
                    className="animate-badge-pop absolute -right-2.5 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-apple-blue px-[4px] text-[10px] font-semibold leading-none text-white shadow-[0_2px_6px_rgba(0,113,227,0.4)]"
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

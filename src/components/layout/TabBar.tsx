'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShoppingBag,
  Heart,
  CalendarDays,
  RefreshCw,
  Users,
  LibraryBig,
  type LucideIcon,
} from 'lucide-react';
import { useWishlist } from '@/lib/wishlist';
import { useNotifications } from '@/lib/notifications-store';

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** 底部 6 个 Tab：选购 / 愿望单 / 活动 / 订阅 / 社区 / 我的库（Brief §10：不得删减） */
const TABS: Tab[] = [
  { href: '/', label: '选购', icon: ShoppingBag },
  { href: '/wishlist', label: '愿望单', icon: Heart },
  { href: '/activities', label: '活动', icon: CalendarDays },
  { href: '/subscription', label: '订阅', icon: RefreshCw },
  { href: '/community', label: '社区', icon: Users },
  { href: '/library', label: '我的库', icon: LibraryBig },
];

/**
 * 底部导航 = 独立的 Navigation Layer（Brief §10，非普通 footer）：
 * - 材质：.glass 毛玻璃 + 发丝顶边 + tabbar 阴影，与 Content Layer 形成 z 轴分离；
 *   .glass 自带 @supports 实底白回退（a7863fa 变灰事故防护）
 * - 高度契约：内容区通过 --tabbar-h（globals.css :root）避让，禁止再写 68/72/76 魔数
 * - 状态模型：选中=品牌蓝+加粗描边 / 未选中=灰（桌面 hover 提亮）/
 *   按压=scale-95 触觉反馈 / 键盘=inset focus ring；整 Tab 命中区 ≥44pt
 * - 角标两处（用户拍板）：愿望单=蓝（本机数据）、我的库=红（登录态通知未读，
 *   数据走 lib/notifications-store 的全局 30s 轮询，进我的库读通知即刻消）；
 *   badge-pop 弹跳为全站唯一过冲例外（用户拍板保留）
 */
export default function TabBar() {
  const pathname = usePathname();
  const { count } = useWishlist();
  // 通知未读：未登录不轮询、恒为 0（store 内部处理登录态）
  const { unread } = useNotifications();

  // 愿望单角标依赖 localStorage，仅在客户端挂载后显示，避免 SSR 水合不一致
  // （通知未读由 store 的 SSR 快照恒 0 兜底，无需 mounted）
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <nav
      aria-label="主导航"
      className="glass fixed inset-x-0 bottom-0 z-overlay border-t border-apple-hairline shadow-tabbar"
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
                'text-micro font-medium tracking-wide',
                'transition-[color,transform] duration-base ease-apple',
                'active:scale-95',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-apple-blue/40',
                active
                  ? 'text-apple-blue'
                  : 'text-apple-text-3 hover:text-apple-text-2',
              ].join(' ')}
            >
              <span className="relative">
                <Icon
                  className="h-[22px] w-[22px]"
                  strokeWidth={active ? 2.2 : 1.7}
                  aria-hidden
                />
                {href === '/wishlist' && mounted && count > 0 && (
                  <span
                    key={count}
                    className="animate-badge-pop absolute -right-2.5 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-apple-blue px-[4px] text-micro font-semibold leading-none text-white shadow-badge"
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
                {href === '/library' && unread > 0 && (
                  <span
                    key={unread}
                    className="animate-badge-pop absolute -right-2.5 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-apple-danger px-[4px] text-micro font-semibold leading-none text-white shadow-badge"
                  >
                    {unread > 99 ? '99+' : unread}
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

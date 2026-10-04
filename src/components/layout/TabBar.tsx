'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  ShoppingBag,
  Heart,
  CalendarDays,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { useWishlist } from '@/lib/wishlist';
import CountBadge from '@/components/ui/CountBadge';
import LiquidTabBar, { type LiquidTabItem } from './LiquidTabBar';

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** 底部 4 个主场景；探究与我的库移入右上角账号中心，原路由保留。 */
const TABS: Tab[] = [
  { href: '/', label: '选购', icon: ShoppingBag },
  { href: '/wishlist', label: '愿望单', icon: Heart },
  { href: '/activities', label: '活动', icon: CalendarDays },
  { href: '/subscription', label: '订阅', icon: RefreshCw },
];

/**
 * 主底部导航。
 *
 * 液态玻璃的药丸 / 玻璃罩 / 位移贴图那套全在 `LiquidTabBar` 里，
 * 与探究广场的板块栏**共用同一个组件**（用户要求两处视觉统一）。
 * 这里只负责本栏特有的东西：路由匹配、两个角标、导航时的彩虹反射。
 */
export default function TabBar() {
  const pathname = usePathname();
  const { count } = useWishlist();

  // 愿望单角标依赖 localStorage，仅在客户端挂载后显示，避免 SSR 水合不一致
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // §7.6 减弱动态效果：关掉跨 Tab 弹动与彩虹，只留颜色切换。
  // 监听 change —— 用户在页面开着时改系统设置也要即时生效（只读一次不够）
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // 彩虹反射（§7.3）：pathname 变化时，仅让「当前激活的那个图标」播一次，
  // 300ms 后撤下覆盖层（动画本身起止全透明，撤下不会闪）
  const [sweepHref, setSweepHref] = useState<string | null>(null);
  useEffect(() => {
    if (reducedMotion) {
      setSweepHref(null);
      return;
    }
    setSweepHref(pathname);
    const t = window.setTimeout(() => setSweepHref(null), 300);
    return () => window.clearTimeout(t);
  }, [pathname, reducedMotion]);

  const activeTab =
    TABS.find((t) =>
      t.href === '/' ? pathname === '/' : pathname.startsWith(t.href),
    ) ?? null;

  if (pathname === '/login' || pathname === '/password-reset') return null;

  const items: LiquidTabItem[] = TABS.map(({ href, label, icon: Icon }) => ({
    key: href,
    label,
    icon: Icon,
    href,
    // 愿望单角标来自本机数据；账号通知 / 私信未读统一转移到右上角头像。
    badge:
      href === '/wishlist' && mounted && count > 0 ? (
        <CountBadge key={count} count={count} tone="blue" />
      ) : null,
    // 彩虹反射覆盖层：同款图标换彩虹渐变笔画 + 左下→右上扫过（只播一次）
    overlay:
      sweepHref === href ? (
        <Icon
          className="animate-prism-sweep pointer-events-none absolute inset-0 h-[22px] w-[22px]"
          stroke="url(#tabbar-prism)"
          strokeWidth={2.2}
          aria-hidden
        />
      ) : null,
  }));

  return (
    <>
      <PrismGradientDefs />
      <LiquidTabBar
        dataMainTabBar
        items={items}
        activeKey={activeTab?.href ?? null}
        ariaLabel="主导航"
        reducedMotion={reducedMotion}
      />
    </>
  );
}

/**
 * 彩虹渐变定义（§7.4 受限色：prism 只出现在激活图标的反射层 + 玻璃色斑）。
 * 零尺寸，只是给上面 `stroke="url(#tabbar-prism)"` 提供定义。
 */
function PrismGradientDefs() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        <linearGradient id="tabbar-prism" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0066CC" />
          <stop offset="18%" stopColor="#32ADE6" />
          <stop offset="36%" stopColor="#34C759" />
          <stop offset="54%" stopColor="#FFCC00" />
          <stop offset="72%" stopColor="#FF9500" />
          <stop offset="86%" stopColor="#FF375F" />
          <stop offset="100%" stopColor="#BF5AF2" />
        </linearGradient>
      </defs>
    </svg>
  );
}

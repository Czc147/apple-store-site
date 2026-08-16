'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * 页面切换淡入（200ms）：以 pathname 为 key 重挂载内容触发入场动画。
 * 仅做入场淡入（路由离场的淡出需拦截导航，收益低且不 Apple）。
 */
export default function PageFade({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-enter">
      {children}
    </div>
  );
}

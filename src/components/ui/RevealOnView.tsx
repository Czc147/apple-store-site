'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * 滚动出现（UI 升级 §9.4）：编辑式区块进入视口时淡入 + 上移 8px，只播一次。
 *
 * 安全性设计（避免「内容因动画不可读」）：
 * - **默认就是可见的**：不预设 opacity 0；只有 IntersectionObserver 触发后
 *   才挂上 `animate-rise`（起始帧才透明），JS 失效/观察器异常时内容照样可读；
 * - `rootMargin` 下沿外扩 10%，在真正进入视口前提早开播，滚动到位时动画已近尾声；
 * - `prefers-reduced-motion: reduce` 时完全不挂动画类（§9.6）；
 * - 只播一次（触发即 disconnect），不循环、不随滚动反复播。
 */
export default function RevealOnView({
  children,
  className,
  /** 触发延迟（错峰用，如列表第 N 项 * 40ms） */
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof IntersectionObserver === 'undefined') return; // 老浏览器：保持默认可见

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px 10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(className, revealed && 'animate-rise')}
      style={revealed && delayMs > 0 ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}

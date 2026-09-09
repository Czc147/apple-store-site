import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface GlassSurfaceProps {
  /** premium=indigo-violet 色斑（CCC 身份色）；neutral=蓝灰色斑 */
  tint?: 'premium' | 'neutral';
  /** 外层容器附加类（间距/几何） */
  className?: string;
  children?: ReactNode;
}

/**
 * Premium 玻璃材质（Brief §08-09：玻璃只用于建立纵深与功能层级，不作装饰）。
 * 配方提炼自素材库 frosted-glass-card：
 *   色彩环境层（柔和色斑，供玻璃"响应背景"）→ 玻璃面板（半透明白 +
 *   backdrop blur/saturate + 白高亮描边 + 双层扩散投影 + 内高光）。
 * 防护（a7863fa 线上变灰事故教训）：面板底色白 0.42 起步，
 * @supports 无 backdrop-filter 时回退近实底白（globals.css .glass-premium）。
 * 使用范围：仅 Hero / 订阅主卡等 premium 区域；普通卡片一律 Surface。
 */
export default function GlassSurface({
  tint = 'premium',
  className,
  children,
}: GlassSurfaceProps) {
  return (
    <div className={cn('relative isolate overflow-hidden rounded-hero', className)}>
      {/* 色彩环境层：玻璃后面的"风景"，静态色斑，无动效 */}
      <div aria-hidden className="absolute inset-0 -z-10">
        {tint === 'premium' ? (
          <div className="absolute inset-0 bg-apple-premium-soft">
            <div className="absolute -left-12 -top-16 h-56 w-56 rounded-full bg-apple-premium/30 blur-3xl" />
            <div className="absolute -bottom-20 -right-12 h-64 w-64 rounded-full bg-apple-premium-2/30 blur-3xl" />
            <div className="absolute left-1/3 top-1/4 h-40 w-40 rounded-full bg-apple-blue/10 blur-3xl" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-apple-surface">
            <div className="absolute -left-12 -top-16 h-56 w-56 rounded-full bg-apple-blue-soft blur-3xl" />
            <div className="absolute -bottom-20 -right-12 h-64 w-64 rounded-full bg-apple-border/30 blur-3xl" />
          </div>
        )}
      </div>
      {/* 玻璃面板 */}
      <div className="glass-premium shadow-premium relative rounded-hero">{children}</div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** 右侧操作槽（返回/铃铛/文字按钮等）——解决登录页"返回"挤在卡片里的问题 */
  actions?: ReactNode;
  className?: string;
}

/**
 * 全站统一页头（audit 收敛：四个页面逐字节手抄同款页头，
 * 且页头 px-5 与内容 px-4 移动端左缘错位——统一 px-page）。
 * 结构遵循 Brief §04：Page → Header → Section → Content → Navigation。
 */
export default function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('px-page pb-6 pt-14', className)}>
      <div className={cn(actions ? 'flex items-end justify-between gap-3' : undefined)}>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-apple-text">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-base leading-relaxed text-apple-text-2">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 pb-1">{actions}</div>}
      </div>
    </header>
  );
}

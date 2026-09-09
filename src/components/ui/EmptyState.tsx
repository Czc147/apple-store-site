import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** 操作槽（重试 / CTA）——旧版缺此槽导致愿望单自造 EmptyWishlist 变体 */
  action?: ReactNode;
  /** page=整页空态 · inline=区块内 · panel=通知面板等小容器 */
  size?: 'page' | 'inline' | 'panel';
  descriptionClassName?: string;
  className?: string;
}

const SIZES = {
  page: 'px-8 pb-16 pt-32',
  inline: 'px-6 py-12',
  panel: 'px-4 py-10',
} as const;

const DISH = {
  page: 'h-16 w-16',
  inline: 'h-14 w-14',
  panel: 'h-12 w-12',
} as const;

const ICON = {
  page: 'h-7 w-7',
  inline: 'h-6 w-6',
  panel: 'h-5 w-5',
} as const;

/**
 * 统一空态（Brief §13.2：Intentional Empty State = 图标 + 标题 + 辅助文案 + 主操作）。
 * audit 收敛：EmptyState / EmptyWishlist / 通知面板自绘 mini 空态三变体合一；
 * 标题从 h1 降为 h2（页面已有 h1，避免双 h1 语义冲突）。
 * 错误态请用 DataError（内部即本组件 variant 化封装）。
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'page',
  descriptionClassName,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center text-center', SIZES[size], className)}>
      <div
        className={cn(
          'mb-6 flex items-center justify-center rounded-full bg-apple-card shadow-card',
          DISH[size],
        )}
      >
        <Icon className={cn('text-apple-text-3', ICON[size])} strokeWidth={1.6} aria-hidden />
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-apple-text">{title}</h2>
      {description && (
        <p
          className={cn(
            'mt-2 max-w-[300px] text-sm leading-relaxed text-apple-text-2',
            descriptionClassName,
          )}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

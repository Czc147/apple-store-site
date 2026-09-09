import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface SectionHeaderProps {
  title: string;
  /** 标题下副文案（首页 editorial 板块用） */
  subtitle?: string;
  /** 显示「共 N {unit}」计数（与 trailing 互斥，trailing 优先） */
  count?: number;
  unit?: string;
  /** 右侧自定义槽（链接/按钮），替代默认计数 */
  trailing?: ReactNode;
  /** md=17px 区块标题（默认）· lg=22px 首页 editorial 板块标题 */
  size?: 'md' | 'lg';
  className?: string;
}

/**
 * 区块标题（audit 收敛：SectionTitle 同构 ×2 + 裸 h2 ×2 +
 * HomeSectionBlock 又一套 22/13px 写法）。
 * md：17px bold + 12px 计数；lg：22px editorial 标题 + 13px 副标。
 */
export default function SectionHeader({
  title,
  subtitle,
  count,
  unit = '项',
  trailing,
  size = 'md',
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2
          className={cn(
            'font-bold tracking-tight text-apple-text',
            size === 'lg' ? 'text-xl leading-tight' : 'text-lg',
          )}
        >
          {title}
        </h2>
        {subtitle && (
          <p className={cn('text-sm text-apple-text-2', size === 'lg' ? 'mt-1' : 'mt-0.5')}>
            {subtitle}
          </p>
        )}
      </div>
      {trailing ??
        (typeof count === 'number' ? (
          <span className="text-xs text-apple-text-3">
            共 {count} {unit}
          </span>
        ) : null)}
    </div>
  );
}

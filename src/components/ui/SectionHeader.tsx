import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface SectionHeaderProps {
  title: string;
  /** 显示「共 N {unit}」计数（与 trailing 互斥，trailing 优先） */
  count?: number;
  unit?: string;
  /** 右侧自定义槽（链接/按钮），替代默认计数 */
  trailing?: ReactNode;
  className?: string;
}

/**
 * 区块标题（audit 收敛：SectionTitle 同构 ×2 + 裸 h2 ×2 +
 * HomeSectionBlock 又一套 22/13px 写法）。
 * 统一：17px bold 标题 + 12px 灰色计数/操作，baseline 对齐。
 */
export default function SectionHeader({
  title,
  count,
  unit = '项',
  trailing,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('mb-3 flex items-baseline justify-between gap-3', className)}>
      <h2 className="text-lg font-bold tracking-tight text-apple-text">{title}</h2>
      {trailing ??
        (typeof count === 'number' ? (
          <span className="text-xs text-apple-text-3">
            共 {count} {unit}
          </span>
        ) : null)}
    </div>
  );
}

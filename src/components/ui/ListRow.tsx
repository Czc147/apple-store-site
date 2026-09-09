import Link from 'next/link';
import { ChevronRight, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface ListRowProps {
  /** 左侧槽：圆底图标 / 头像等（尺寸由调用方控制） */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** 右侧槽；'chevron'/'external' 为预置图标，也可传任意节点 */
  trailing?: ReactNode | 'chevron' | 'external';
  href?: string;
  /** href 新标签页打开 */
  external?: boolean;
  onClick?: () => void;
  selected?: boolean;
  destructive?: boolean;
  /** sheet=px-6（弹层内，默认）· card=px-4（卡片列表内） */
  padding?: 'sheet' | 'card';
  className?: string;
}

/**
 * 统一列表行（Brief §14 ListRow）。
 * audit 收敛：SheetItem / ContentsView 行卡 / 通知行 / 订阅商品行 /
 * 每日历史行 五处同构各写一遍。
 * 规约：min-h 52px（≥44pt 命中）；hover 浅灰 + active 加深；
 * focus-visible 用 inset ring（行是通栏元素，外扩 ring 会溢出容器）。
 */
export default function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  href,
  external,
  onClick,
  selected,
  destructive,
  padding = 'sheet',
  className,
}: ListRowProps) {
  const trailingNode =
    trailing === 'chevron' ? (
      <ChevronRight className="h-4 w-4 flex-none text-apple-text-3" aria-hidden />
    ) : trailing === 'external' ? (
      <ExternalLink className="h-3.5 w-3.5 flex-none text-apple-blue" aria-hidden />
    ) : (
      trailing
    );

  const inner = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-md font-medium',
            destructive ? 'text-apple-danger' : 'text-apple-text',
          )}
        >
          {title}
        </span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-xs text-apple-text-3">{subtitle}</span>
        )}
      </span>
      {trailingNode}
    </>
  );

  const interactive = Boolean(href || onClick);
  const cls = cn(
    'flex min-h-[52px] w-full items-center gap-3.5 text-left',
    // 交互反馈只在可点行出现（静态行 hover 高亮会误导可点性）
    interactive &&
      'transition-colors duration-fast ease-apple hover:bg-apple-bg/60 active:bg-apple-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-apple-blue/40',
    padding === 'card' ? 'px-4 py-3' : 'px-6 py-3.5',
    selected && 'bg-apple-blue-soft/60',
    className,
  );

  if (href) {
    return external ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    ) : (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

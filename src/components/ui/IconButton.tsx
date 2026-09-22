import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface IconButtonProps {
  icon: LucideIcon;
  /** 无障碍名称（aria-label），必填 */
  label: string;
  onClick?: () => void;
  href?: string;
  /** plain=无底 hover 浅灰 · filled=常显浅灰底 · on-dark=深色图上白纱底 */
  variant?: 'plain' | 'filled' | 'on-dark';
  /** 图标视觉尺寸（命中区恒为 44×44，不随此档变化） */
  iconSize?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}

const ICON_SIZE = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
} as const;

/**
 * 图标按钮（Brief §11：44×44pt 命中标准）。
 * audit 收敛：关闭钮曾 32×32、删除钮 ~16px、铃铛 36×36 ——
 * 统一为视觉圆 32px + 外层 44×44 命中区（透明外扩，不占额外布局）。
 */
export default function IconButton({
  icon: Icon,
  label,
  onClick,
  href,
  variant = 'plain',
  iconSize = 'sm',
  disabled,
  className,
}: IconButtonProps) {
  const wrap = cn(
    'group inline-flex h-11 w-11 flex-none items-center justify-center rounded-full',
    // 圆形小按钮按得浅一档（.pressable-soft，见 globals.css 的丝滑按压）
    'pressable-soft',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40',
    'disabled:cursor-not-allowed disabled:opacity-40',
    className,
  );
  const bubble = cn(
    'flex h-8 w-8 items-center justify-center rounded-full',
    'transition-colors duration-fast ease-apple',
    variant === 'plain' && 'text-apple-text-2 group-hover:bg-apple-bg group-hover:text-apple-text',
    variant === 'filled' &&
      'bg-apple-bg text-apple-text-2 group-hover:bg-apple-border/50 group-hover:text-apple-text',
    variant === 'on-dark' && 'bg-white/15 text-white group-hover:bg-white/25',
  );
  const inner = (
    <span className={bubble}>
      <Icon className={ICON_SIZE[iconSize]} aria-hidden />
    </span>
  );

  if (href && !disabled) {
    return (
      <Link href={href} aria-label={label} className={wrap}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className={wrap}>
      {inner}
    </button>
  );
}

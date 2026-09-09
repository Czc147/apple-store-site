import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 传入则渲染为链接；external=true 时新标签页打开 */
  href?: string;
  external?: boolean;
  fullWidth?: boolean;
  /** loading = spinner + 禁点（文案由 children 提供） */
  loading?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  className?: string;
  'aria-label'?: string;
  'aria-haspopup'?: 'dialog' | 'menu' | 'listbox' | 'tree' | 'grid';
  children: ReactNode;
}

/**
 * 全站统一按钮（Brief 的 Primary/Secondary/Tertiary Action 唯一实现）。
 * 收敛自 audit：主按钮类串曾手抄 12+ 处、高度 4 档、按压 scale 5 档、disabled 3 套。
 * 规约：primary=品牌蓝胶囊+btn-blue 投影；secondary=白底描边；ghost=蓝字无底；
 * danger=红字无底（破坏性文字操作）。按压统一 active:scale-[0.97]。
 * disabled 两规则：实底按钮变灰底灰字，文字类按钮降透明度。
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-apple-blue text-white shadow-btn-blue hover:bg-apple-blue-hover active:bg-apple-blue-active disabled:bg-apple-border disabled:text-apple-text-3 disabled:shadow-none',
  secondary:
    'border border-apple-border bg-apple-card text-apple-text hover:bg-apple-bg active:bg-apple-surface disabled:opacity-40',
  ghost: 'text-apple-blue hover:bg-apple-blue-soft disabled:opacity-40',
  danger: 'text-apple-danger hover:bg-apple-danger-soft disabled:opacity-40',
  // 成功反馈态（如「已复制」）：浅绿底绿字，非可点击语义时配合 disabled 使用
  success: 'border border-transparent bg-apple-success-soft text-apple-success disabled:opacity-100',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-10 px-5 text-base',
  lg: 'h-11 px-6 text-md',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  href,
  external,
  fullWidth,
  loading,
  disabled,
  type,
  onClick,
  className,
  'aria-label': ariaLabel,
  'aria-haspopup': ariaHaspopup,
  children,
}: ButtonProps) {
  const cls = cn(
    'inline-flex items-center justify-center gap-1.5 rounded-btn font-medium',
    'transition-[background-color,color,transform,box-shadow] duration-base ease-apple',
    'active:scale-[0.97]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40 focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed',
    VARIANTS[variant],
    SIZES[size],
    fullWidth && 'w-full',
    className,
  );

  const content = (
    <>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </>
  );

  if (href && !disabled && !loading) {
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={ariaLabel}
          className={cls}
        >
          {content}
        </a>
      );
    }
    return (
      <Link href={href} aria-label={ariaLabel} className={cls}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type ?? 'button'}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
      aria-haspopup={ariaHaspopup}
      className={cls}
    >
      {content}
    </button>
  );
}

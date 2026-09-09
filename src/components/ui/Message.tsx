import { AlertCircle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface MessageProps {
  tone?: 'success' | 'error' | 'info';
  title?: string;
  /** 描述正文 */
  children?: ReactNode;
  /** 底部操作槽（重试/跳转按钮等） */
  action?: ReactNode;
  /** 覆盖默认图标 */
  icon?: LucideIcon;
  className?: string;
}

/**
 * 页内轻提示条（audit 收敛：成功条 ×2 两套绿 + 圆角/阴影漂移、
 * demo 提示条第 4 种信息条样式、裸 hex 成功/错误文字 ×8 无容器）。
 * 语义色统一走 token：success #1D8A3E / danger #D70015 / blue。
 * error 自动 role=alert，success 自动 role=status。
 */
const TONES = {
  success: {
    border: 'border-apple-success/25',
    bg: 'bg-apple-success-soft',
    text: 'text-apple-success',
    Icon: CheckCircle2,
  },
  error: {
    border: 'border-apple-danger/25',
    bg: 'bg-apple-danger-soft',
    text: 'text-apple-danger',
    Icon: AlertCircle,
  },
  info: {
    border: 'border-apple-blue/25',
    bg: 'bg-apple-blue-soft',
    text: 'text-apple-blue',
    Icon: Info,
  },
} as const;

export default function Message({
  tone = 'info',
  title,
  children,
  action,
  icon,
  className,
}: MessageProps) {
  const t = TONES[tone];
  const Icon = icon ?? t.Icon;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-card border p-4', t.border, t.bg, className)}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={cn('mt-0.5 h-4 w-4 flex-none', t.text)} aria-hidden />
        <div className="min-w-0 flex-1">
          {title && <p className="text-base font-semibold text-apple-text">{title}</p>}
          {children && (
            <p className={cn('text-sm leading-relaxed text-apple-text-2', title && 'mt-0.5')}>
              {children}
            </p>
          )}
          {action && <div className="mt-2.5">{action}</div>}
        </div>
      </div>
    </div>
  );
}

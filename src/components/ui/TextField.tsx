import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label?: string;
  /** label 仅读屏可见（视觉不占位） */
  srLabel?: boolean;
  error?: string | null;
  /** input=12px 圆角（表单场景，默认）· btn=胶囊（内嵌工具条场景） */
  radius?: 'input' | 'btn';
  /** 输入框附加类 */
  className?: string;
  wrapperClassName?: string;
}

/**
 * 全站统一输入框（audit 收敛：focus 方案 A/B 两派 ×5 处、
 * 圆角 rounded-xl token 外、高度不一）。
 * 标准 = 原方案 A：聚焦品牌蓝边框 + 浅蓝 ring；h-11 满足 44pt 命中；
 * 错误态红边框 + role=alert 文案。
 */
export default function TextField({
  label,
  srLabel,
  error,
  radius = 'input',
  id,
  className,
  wrapperClassName,
  ...rest
}: TextFieldProps) {
  return (
    <div className={cn('w-full', wrapperClassName)}>
      {label && (
        <label
          htmlFor={id}
          className={cn('mb-1.5 block text-sm font-medium text-apple-text-2', srLabel && 'sr-only')}
        >
          {label}
        </label>
      )}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        className={cn(
          'h-11 w-full border bg-apple-card px-4 text-md text-apple-text',
          'placeholder:text-apple-text-3',
          'transition duration-fast ease-apple',
          'focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/55',
          'disabled:cursor-not-allowed disabled:bg-apple-bg disabled:text-apple-text-3',
          radius === 'input' ? 'rounded-input' : 'rounded-btn',
          // 常态描边走钢灰 #86868B（§4.3：输入框轮廓要比卡片描边更明确）
          error ? 'border-apple-danger' : 'border-apple-text-3',
          className,
        )}
        {...rest}
      />
      {error && (
        <p className="mt-1.5 text-sm text-apple-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

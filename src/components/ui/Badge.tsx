import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'blue' | 'neutral' | 'success' | 'danger' | 'on-image';

interface BadgeProps {
  tone?: BadgeTone;
  /** sm=10px 字（角标/微标）· md=11px 字（常规标签） */
  size?: 'sm' | 'md';
  className?: string;
  children: ReactNode;
}

/**
 * 统一徽章/标签（audit 收敛：时长徽章 11/12px 两档、封面角标参数各异、
 * 演示数据条自成一体 ×5 处）。
 * on-image = 封面图上的毛玻璃角标（唯一允许压在图片上的材质）。
 */
const TONES: Record<BadgeTone, string> = {
  blue: 'bg-apple-blue-soft text-apple-blue',
  neutral: 'bg-apple-bg text-apple-text-2',
  success: 'bg-apple-success-soft text-apple-success',
  danger: 'bg-apple-danger-soft text-apple-danger',
  'on-image': 'bg-apple-scrim text-white backdrop-blur-sm',
};

const SIZES = {
  sm: 'px-2 py-0.5 text-micro',
  md: 'px-2.5 py-1 text-2xs',
} as const;

export default function Badge({ tone = 'blue', size = 'md', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium leading-none',
        TONES[tone],
        SIZES[size],
        className,
      )}
    >
      {children}
    </span>
  );
}

'use client';

import { Minus, Plus } from 'lucide-react';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

/**
 * Apple 式胶囊数量步进器：-/数字/+，最小 1 最大 99。
 * audit 收敛：加减钮视觉 32×32 保留，after 伪元素外扩至 44×44 命中
 * （Brief §11 触标标准）；disabled 灰字 + not-allowed 保留。
 */
export default function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
}: QuantityStepperProps) {
  const btnCls =
    'relative flex h-8 w-8 items-center justify-center text-apple-text ' +
    'transition-colors duration-fast ease-apple hover:bg-apple-bg active:bg-apple-border/40 ' +
    'disabled:cursor-not-allowed disabled:text-apple-border disabled:hover:bg-transparent ' +
    'after:absolute after:-inset-1.5 after:content-[""] ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40';

  return (
    <div
      className="flex items-center rounded-btn border border-apple-border bg-apple-card"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="减少数量"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${btnCls} rounded-l-btn`}
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
      </button>
      <span
        className="min-w-8 select-none text-center text-base font-medium tabular-nums"
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="增加数量"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={`${btnCls} rounded-r-btn`}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
      </button>
    </div>
  );
}

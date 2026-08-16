'use client';

import { Minus, Plus } from 'lucide-react';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

/** Apple 式胶囊数量步进器：-/数字/+，最小 1 最大 99 */
export default function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
}: QuantityStepperProps) {
  return (
    <div
      className="flex items-center rounded-btn border border-apple-border bg-white"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="减少数量"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-8 w-8 items-center justify-center rounded-l-btn text-apple-text transition-colors duration-200 ease-apple hover:bg-apple-bg active:bg-apple-border/40 disabled:cursor-not-allowed disabled:text-apple-border"
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
      </button>
      <span
        className="min-w-[32px] select-none text-center text-[14px] font-medium tabular-nums"
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="增加数量"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex h-8 w-8 items-center justify-center rounded-r-btn text-apple-text transition-colors duration-200 ease-apple hover:bg-apple-bg active:bg-apple-border/40 disabled:cursor-not-allowed disabled:text-apple-border"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
      </button>
    </div>
  );
}

'use client';

import { Minus, Plus } from 'lucide-react';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

/**
 * 数量步进器（§8.2：数量控制弱化但好点）。
 * 弱化：无描边，改用 studio-mist 浅灰胶囊 + 中灰图标与数字，视觉钮 32×32 收敛为圆形；
 * 好点：两钮 after 伪元素外扩至 44×44 命中区（Brief §11 触标标准）不变；
 * 禁用态灰字 + not-allowed，值区域 tabular-nums 保证数字不跳动、aria-live 播报。
 */
export default function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
}: QuantityStepperProps) {
  const btnCls =
    'relative flex h-8 w-8 items-center justify-center rounded-full text-apple-text-2 ' +
    'transition-colors duration-fast ease-apple hover:bg-apple-card hover:text-apple-text ' +
    'active:bg-apple-border/40 disabled:cursor-not-allowed disabled:text-apple-border ' +
    'disabled:hover:bg-transparent ' +
    'after:absolute after:-inset-1.5 after:content-[""] ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40';

  return (
    <div
      className="flex items-center rounded-full bg-apple-bg"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="减少数量"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={btnCls}
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
      </button>
      <span
        className="min-w-7 select-none text-center text-base font-medium tabular-nums text-apple-text"
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="增加数量"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={btnCls}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
      </button>
    </div>
  );
}

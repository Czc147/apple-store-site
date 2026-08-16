'use client';

import { formatPrice } from '@/lib/format';

interface CheckoutBarProps {
  totalQty: number;
  totalAmount: number;
  onCheckout: () => void;
}

/**
 * 底部悬浮结算栏（毛玻璃，位于 TabBar 上方）：
 * 共 X 件商品 · 合计 ¥xx.xx + 全宽「去结算」主按钮
 */
export default function CheckoutBar({
  totalQty,
  totalAmount,
  onCheckout,
}: CheckoutBarProps) {
  return (
    <div className="fixed inset-x-5 bottom-[calc(68px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[560px]">
      <div className="rounded-hero border border-white/60 glass p-4 shadow-popover">
        <div className="flex items-baseline justify-between px-1">
          <span className="text-[13px] text-apple-text-2">
            共 <b className="font-semibold text-apple-text">{totalQty}</b> 件商品
          </span>
          <span className="text-[13px] text-apple-text-2">
            合计
            <b className="ml-1.5 text-[19px] font-semibold tabular-nums tracking-tight text-apple-text">
              {formatPrice(totalAmount)}
            </b>
          </span>
        </div>
        <button
          type="button"
          onClick={onCheckout}
          className="mt-3 w-full rounded-btn bg-apple-blue py-3 text-[15px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.3)] transition-[background-color,transform] duration-200 ease-apple hover:bg-apple-blue-hover active:scale-[0.99] active:bg-apple-blue-active"
        >
          去结算
        </button>
      </div>
    </div>
  );
}

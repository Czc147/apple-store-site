'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { WishlistItem } from '@/lib/wishlist';
import type { PaymentMethod } from '@/lib/order-types';
import { formatPrice } from '@/lib/format';
import PaymentMethodBody from '@/components/checkout/PaymentMethodBody';

interface CheckoutSheetProps {
  open: boolean;
  onClose: () => void;
  items: WishlistItem[];
  /** 推送订单成功回调（父组件负责清空愿望单 / 展示成功提示） */
  onOrderCreated: (orderNo: string) => void;
}

/**
 * 多商品结算弹窗（底部滑出毛玻璃卡片）：
 * 展示商品清单 + 总金额 → 内置「去微信支付 / 去支付宝支付」两键 →
 * 点开显示后台配置的收款码 → 「推送订单」走本站订单闭环（不再外跳酷发卡）。
 */
export default function CheckoutSheet({
  open,
  onClose,
  items,
  onOrderCreated,
}: CheckoutSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const buildBody = (method: PaymentMethod) => ({
    items: items.map((i) => ({
      ref_type: 'sub_unit' as const,
      ref_id: i.sub_unit_id,
      quantity: i.quantity,
    })),
    payment_method: method,
  });

  return (
    <div
      className={`fixed inset-0 z-[60] ${
        open
          ? 'visible'
          : 'invisible pointer-events-none [transition:visibility_0s_linear_250ms]'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-sheet-title"
    >
      {/* 遮罩（加深：让下层不再透成「白卡叠白卡」，保留毛玻璃感） */}
      <div
        aria-hidden
        className={`absolute inset-0 bg-black/45 transition-opacity duration-[250ms] ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 定位层：flex 靠底 + 上下安全间距，用百分比高度（非 dvh）约束卡片，保证任何窗口高度下卡片都不超出视口；点击空白处关闭 */}
      <div
        onClick={onClose}
        className="absolute inset-0 flex flex-col items-center justify-end px-4 pb-[calc(72px+env(safe-area-inset-bottom))] pt-4"
      >
        {/* 滑出卡片 */}
        <div
          onClick={(e) => e.stopPropagation()}
          className={`relative w-full max-w-[480px] max-h-full overflow-y-auto rounded-hero border border-white/60 glass p-6 pt-7 shadow-popover transition-transform duration-[250ms] ease-apple ${
            open ? 'translate-y-0' : 'translate-y-8'
          }`}
        >
          <div
            className="absolute left-1/2 top-2.5 h-1 w-9 -translate-x-1/2 rounded-full bg-black/10"
            aria-hidden
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-apple-text-2 transition-colors duration-200 hover:bg-black/10 active:scale-95"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>

          <h3
            id="checkout-sheet-title"
            className="text-center text-[17px] font-semibold tracking-tight"
          >
            确认结算
          </h3>

          {/* 商品清单 */}
          <ul className="mt-4 space-y-2.5">
            {items.map((item) => (
              <li
                key={item.sub_unit_id}
                className="flex items-center gap-3 rounded-card border border-apple-border bg-apple-bg px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-apple-text">
                    {item.name}
                  </div>
                  <div className="mt-0.5 text-[12px] tabular-nums text-apple-text-2">
                    ×{item.quantity} · 小计 {formatPrice(item.price * item.quantity)}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4">
            <PaymentMethodBody
              total={total}
              buildBody={buildBody}
              onSuccess={onOrderCreated}
              loginFrom="/wishlist"
            />
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full rounded-btn border border-apple-border bg-white py-2.5 text-[14px] font-medium text-apple-text transition-colors duration-200 ease-apple hover:bg-apple-bg active:bg-apple-surface"
          >
            再想想
          </button>
        </div>
      </div>
    </div>
  );
}

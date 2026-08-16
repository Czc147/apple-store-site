'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { WishlistItem } from '@/lib/wishlist';
import { formatPrice } from '@/lib/format';

interface CheckoutSheetProps {
  open: boolean;
  onClose: () => void;
  items: WishlistItem[];
}

/** 新标签页打开发卡平台付款链接 */
function openPayment(url: string) {
  window.open(url, '_blank', 'noopener');
}

/**
 * 多商品结算弹窗（底部滑出毛玻璃卡片）：
 * - 列出每件商品的数量 / 小计 / 独立「去支付」按钮（逐个点击最稳妥）
 * - 「依次打开全部支付页」一键尝试（受浏览器弹窗拦截策略限制，故有提示）
 * - 所有 payment_url 均指向第三方发卡平台（酷发卡），本站只做跳转
 */
export default function CheckoutSheet({ open, onClose, items }: CheckoutSheetProps) {
  const payable = items.filter((i) => Boolean(i.payment_url));

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
      {/* 遮罩 */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/25 transition-opacity duration-[250ms] ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 滑出卡片 */}
      <div
        className={`absolute inset-x-4 bottom-[calc(72px+env(safe-area-inset-bottom))] mx-auto max-h-[72dvh] max-w-[480px] overflow-y-auto rounded-hero border border-white/60 glass p-6 pt-7 shadow-popover transition-[opacity,transform] duration-[250ms] ease-apple ${
          open ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
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
        <p className="mt-1 text-center text-[13px] leading-relaxed text-apple-text-2">
          将依次跳转至发卡平台的支付页面，请逐笔完成付款
        </p>

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
              {item.payment_url ? (
                <button
                  type="button"
                  onClick={() => openPayment(item.payment_url!)}
                  className="flex-none rounded-btn bg-apple-blue px-4 py-1.5 text-[12.5px] font-medium text-white transition-colors duration-200 ease-apple hover:bg-apple-blue-hover active:bg-apple-blue-active"
                >
                  去支付
                </button>
              ) : (
                <span className="flex-none text-[12px] text-apple-text-3">
                  未配置付款链接
                </span>
              )}
            </li>
          ))}
        </ul>

        {/* 一键全部打开 */}
        <button
          type="button"
          disabled={payable.length === 0}
          onClick={() => payable.forEach((i) => openPayment(i.payment_url!))}
          className="mt-5 w-full rounded-btn bg-apple-blue py-3 text-[15px] font-medium text-white transition-colors duration-200 ease-apple hover:bg-apple-blue-hover active:bg-apple-blue-active disabled:cursor-not-allowed disabled:bg-apple-border disabled:text-apple-text-3"
        >
          全部打开（{payable.length} 个支付页）
        </button>
        <p className="mt-2 text-center text-[11.5px] leading-relaxed text-apple-text-3">
          若浏览器拦截了多个弹窗，请逐个点击上方「去支付」
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-btn border border-apple-border bg-white py-2.5 text-[14px] font-medium text-apple-text transition-colors duration-200 ease-apple hover:bg-apple-bg active:bg-apple-surface"
        >
          再想想
        </button>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { WishlistItem } from '@/lib/wishlist';
import type { PaymentMethod } from '@/lib/order-types';
import { formatPrice } from '@/lib/format';
import BottomSheet from '@/components/ui/BottomSheet';
import Button from '@/components/ui/Button';
import PaymentMethodBody from '@/components/checkout/PaymentMethodBody';
import CouponCodeInput, { type AppliedQuote } from '@/components/checkout/CouponCodeInput';

interface CheckoutSheetProps {
  open: boolean;
  onClose: () => void;
  items: WishlistItem[];
  /** 推送订单成功回调（父组件负责清空愿望单 / 展示成功提示） */
  onOrderCreated: (orderNo: string) => void;
}

/**
 * 多商品结算弹层：商品清单 + 总金额 → 微信/支付宝两键 →
 * 收款码 → 「推送订单」走本站订单闭环（不再外跳酷发卡）。
 * audit 收敛：原手搓弹层（非 Portal / 假滑入 translate-y-8 / 遮罩 black/45 /
 * 32px 关闭钮 / z-[60]）→ BottomSheet primitive（真滑入 + 焦点陷阱 +
 * 44pt 关闭钮 + 统一遮罩/z 序），Esc/滚动锁由 primitive 提供。
 * 业务逻辑（buildBody / PaymentMethodBody 订单闭环）原样保留。
 */
export default function CheckoutSheet({
  open,
  onClose,
  items,
  onOrderCreated,
}: CheckoutSheetProps) {
  // 结算报价（需求 6）：服务端试算通过后才记下来。可能来自券，也可能是
  // **不填码时的会员价自动报价** —— 后者没有 code，下单不带 coupon_code
  const [quote, setQuote] = useState<AppliedQuote | null>(null);

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const payable = quote ? quote.payable : total;

  const orderItems = items.map((i) => ({
    ref_type: 'sub_unit' as const,
    ref_id: i.sub_unit_id,
    quantity: i.quantity,
  }));

  const buildBody = (method: PaymentMethod) => ({
    items: orderItems,
    payment_method: method,
    // 只有真的填了券码才带 —— 自动报价（会员价）没有 code
    ...(quote?.code ? { coupon_code: quote.code } : {}),
  });

  return (
    <BottomSheet open={open} onClose={onClose} title="确认结算">
      <div className="px-6 pb-4 pt-2">
        {/* 商品清单 */}
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li
              key={item.sub_unit_id}
              className="rounded-card border border-apple-border bg-apple-bg px-3.5 py-3"
            >
              <div className="truncate text-base font-medium text-apple-text">
                {item.name}
              </div>
              <div className="mt-0.5 text-xs tabular-nums text-apple-text-2">
                ×{item.quantity} · 小计 {formatPrice(item.price * item.quantity)}
              </div>
            </li>
          ))}
        </ul>

        {/* 优惠码（需求 6）：一人一码，服务端试算权威校验 */}
        <div className="mt-4">
          <CouponCodeInput items={orderItems} applied={quote} onChange={setQuote} orderTotal={total} />
        </div>

        {/* 金额明细：原价 / 优惠 / 实付。
            条件是「有优惠」而不是「有券」—— 只吃会员折扣（无券）时也要显示，
            否则用户看到的合计是原价、实际按折扣付款，账实不符。 */}
        {quote && quote.discount_amount > 0 && (
          <div className="mt-3 space-y-1 rounded-card border border-apple-border bg-apple-bg px-3.5 py-3 text-sm">
            <div className="flex items-center justify-between text-apple-text-2">
              <span>商品合计</span>
              <span className="tabular-nums">{formatPrice(quote.original_total)}</span>
            </div>
            <div className="flex items-center justify-between text-apple-success">
              <span>优惠</span>
              <span className="tabular-nums">-{formatPrice(quote.discount_amount)}</span>
            </div>
            <div className="flex items-center justify-between font-semibold text-apple-text">
              <span>实付</span>
              <span className="tabular-nums">{formatPrice(quote.payable)}</span>
            </div>
          </div>
        )}

        <div className="mt-4">
          <PaymentMethodBody
            total={payable}
            buildBody={buildBody}
            onSuccess={onOrderCreated}
            loginFrom="/wishlist"
          />
        </div>

        <Button variant="secondary" size="lg" fullWidth className="mt-3" onClick={onClose}>
          再想想
        </Button>
      </div>
    </BottomSheet>
  );
}

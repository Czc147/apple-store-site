'use client';

import type { WishlistItem } from '@/lib/wishlist';
import type { PaymentMethod } from '@/lib/order-types';
import { formatPrice } from '@/lib/format';
import BottomSheet from '@/components/ui/BottomSheet';
import Button from '@/components/ui/Button';
import PaymentMethodBody from '@/components/checkout/PaymentMethodBody';

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

        <div className="mt-4">
          <PaymentMethodBody
            total={total}
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

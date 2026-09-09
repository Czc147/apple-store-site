'use client';

import { formatPrice } from '@/lib/format';
import Button from '@/components/ui/Button';

interface CheckoutBarProps {
  totalQty: number;
  totalAmount: number;
  onCheckout: () => void;
}

/**
 * 底部悬浮结算栏（毛玻璃，位于 TabBar 上方，属 Navigation/Floating 层）：
 * 共 X 件商品 · 合计 ¥xx.xx + 全宽「去结算」主按钮。
 * audit 收敛：bottom 68px 魔数 → --tabbar-h 变量（与 TabBar/客服 FAB 同一契约）；
 * z-40 → z-panel；560px → max-w-bar token；去结算 → Button primitive。
 */
export default function CheckoutBar({
  totalQty,
  totalAmount,
  onCheckout,
}: CheckoutBarProps) {
  return (
    <div className="fixed inset-x-4 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-panel mx-auto max-w-bar sm:inset-x-5">
      <div className="glass rounded-hero border border-white/60 p-4 shadow-popover">
        <div className="flex items-baseline justify-between px-1">
          <span className="text-sm text-apple-text-2">
            共 <b className="font-semibold text-apple-text">{totalQty}</b> 件商品
          </span>
          <span className="text-sm text-apple-text-2">
            合计
            <b className="ml-1.5 text-xl font-semibold tabular-nums tracking-tight text-apple-text">
              {formatPrice(totalAmount)}
            </b>
          </span>
        </div>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="mt-3"
          onClick={onCheckout}
        >
          去结算
        </Button>
      </div>
    </div>
  );
}

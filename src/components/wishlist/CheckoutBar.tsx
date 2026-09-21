'use client';

import { formatPrice } from '@/lib/format';
import Button from '@/components/ui/Button';

interface CheckoutBarProps {
  totalQty: number;
  totalAmount: number;
  onCheckout: () => void;
}

/**
 * 悬浮结算条（§8.2，Navigation/Floating 层）：
 * 白色毛玻璃（.glass，复用 TabBar 同款材质与实底白降级）+ 胶囊圆角 +
 * 56px（移动）/ 64px（sm 起）高 + 「数量 · 总价 · 去结算」单行排布。
 *
 * 位置契约：固定在 TabBar 上方 —— bottom = --tabbar-h + 安全区 + 12px 呼吸间距；
 * 列表底部避让用同一表达式（见 WishlistPageClient 的 pb 注释），禁止再写魔数。
 */
export default function CheckoutBar({
  totalQty,
  totalAmount,
  onCheckout,
}: CheckoutBarProps) {
  return (
    <div className="fixed inset-x-4 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+12px)] z-panel mx-auto max-w-bar sm:inset-x-6">
      <div className="glass flex h-14 items-center gap-3 rounded-full border border-white/60 py-1.5 pl-5 pr-1.5 shadow-popover sm:h-16 sm:py-2.5 sm:pl-6">
        <span className="flex-none text-sm text-apple-text-2">
          共 <b className="font-semibold tabular-nums text-apple-text">{totalQty}</b> 件
        </span>

        <span className="ml-auto flex min-w-0 items-baseline gap-1.5">
          <span className="flex-none text-xs text-apple-text-2">合计</span>
          <span className="truncate text-lg font-semibold tabular-nums tracking-tight text-apple-text sm:text-xl">
            {formatPrice(totalAmount)}
          </span>
        </span>

        <Button
          variant="primary"
          size="lg"
          className="flex-none px-5 sm:px-6"
          onClick={onCheckout}
        >
          去结算
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import { useWishlist } from '@/lib/wishlist';
import EmptyState from '@/components/ui/EmptyState';
import Message from '@/components/ui/Message';
import Button from '@/components/ui/Button';
import WishlistRow from './WishlistRow';
import CheckoutBar from './CheckoutBar';
import CheckoutSheet from './CheckoutSheet';

/** 挂载前骨架（localStorage 仅在浏览器可读，避免 SSR 水合不一致）
    形状与最终版式同构（§9.5）：统计摘要条 + 80px 封面砖行，避免加载完跳变 */
function MountSkeleton() {
  return (
    <div className="px-page" aria-busy="true" aria-label="愿望单加载中">
      <div className="skeleton mb-3.5 h-5 w-40 rounded-chip" />
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3.5 rounded-card bg-apple-card p-3.5">
            <div className="skeleton h-20 w-20 flex-none rounded-input" />
            <div className="min-w-0 flex-1">
              <div className="skeleton h-4 w-3/5 rounded-chip" />
              <div className="skeleton mt-2 h-3 w-1/3 rounded-chip" />
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="skeleton h-8 w-[92px] rounded-full" />
                <div className="skeleton h-5 w-16 rounded-chip" />
              </div>
            </div>
            <div className="skeleton h-8 w-8 flex-none rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 愿望单页主体（§8.2 收藏画廊 + 清晰结算）：
 * - 空态 = Intentional Empty State（Brief §13.2：图标 + 标题 + 辅助文案 + 主操作，
 *   复用 EmptyState primitive 的 action 槽——旧版因 EmptyState 无槽而自造变体）
 * - 统计摘要（种数 / 件数）+ 清空入口
 * - 列表（大封面行 / 数量步进 / 小计 / 左滑删除 / 垃圾桶删除）
 * - 「清空愿望单」二次确认（3 秒未确认自动还原，确认态 danger 红提示）
 * - 底部悬浮结算条 + 结算弹窗（订单闭环）
 * - 数据持久化在 localStorage（wishlist store），刷新不丢失
 */
export default function WishlistPageClient() {
  const { items, remove, setQuantity, clear } = useWishlist();

  const [mounted, setMounted] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pushedOrder, setPushedOrder] = useState<string | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  /** 清空两步确认：第一次点击变为「确认清空？」（danger 红），3 秒内再点才真正清空 */
  const handleClearClick = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      clearTimer.current = setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setConfirmClear(false);
    setOpenRowId(null);
    clear();
  };

  /** 结算分发：打开结算弹窗（内置微信/支付宝收款码 + 推送订单） */
  const handleCheckout = () => {
    setPushedOrder(null);
    setSheetOpen(true);
  };

  /** 推送订单成功：清空愿望单 + 提示 */
  const handleOrderCreated = (orderNo: string) => {
    setSheetOpen(false);
    setPushedOrder(orderNo);
    clear();
  };

  if (!mounted) return <MountSkeleton />;

  if (items.length === 0) {
    return (
      <div className="px-page">
        {/* 推送成功后愿望单被清空 → 这里是用户实际停留的空态，
            提示必须放在这一支，否则「订单已成功推送」永远看不到（本次修复） */}
        {pushedOrder && (
          <Message tone="success" title="订单已成功推送" className="mb-4">
            订单号 {pushedOrder}。我们确认收款后会自动把卡密发送到您的「我的库」。
          </Message>
        )}
        <EmptyState
          icon={Heart}
          title="愿望单还是空的"
          description="在选购页轻点卡片，把心仪的内容收藏到这里，结算时一次推送。"
          action={
            <Button variant="primary" size="md" href="/">
              去选购
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      {/* 推送成功提示 */}
      {pushedOrder && (
        <div className="px-page pb-3">
          <Message tone="success" title="订单已成功推送">
            订单号 {pushedOrder}。我们确认收款后会自动把卡密发送到您的「我的库」。
          </Message>
        </div>
      )}

      {/* 统计摘要（§8.2）：种数 / 件数 + 清空入口。纯排版表达（页面底色已是 mist，
          再铺浅灰块不可见），数字加重、标签弱化；清空为两步确认，命中区 44pt */}
      <div className="flex items-center justify-between gap-3 px-page pb-2.5 pt-1">
        <p className="flex min-w-0 items-baseline gap-2.5 text-sm text-apple-text-2">
          <span className="truncate">
            <b className="text-lg font-semibold tabular-nums text-apple-text">
              {items.length}
            </b>{' '}
            种商品
          </span>
          <span aria-hidden className="text-apple-border">
            ·
          </span>
          <span className="flex-none">
            共{' '}
            <b className="text-lg font-semibold tabular-nums text-apple-text">
              {totalQty}
            </b>{' '}
            件
          </span>
        </p>
        <button
          type="button"
          onClick={handleClearClick}
          className={`-my-1 inline-flex min-h-11 flex-none items-center rounded-btn px-1 text-sm font-medium transition-colors duration-fast ease-apple active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-danger/40 ${
            confirmClear
              ? 'text-apple-danger'
              : 'text-apple-text-3 hover:text-apple-text-2'
          }`}
        >
          {confirmClear ? '确认清空？' : '清空愿望单'}
        </button>
      </div>

      {/* 商品列表：底部避让 = TabBar(--tabbar-h + 安全区) + 结算条 56px + 间距 12px + 呼吸 32px */}
      <ul className="space-y-3 px-page pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+100px)]">
        {items.map((item) => (
          <WishlistRow
            key={item.sub_unit_id}
            item={item}
            open={openRowId === item.sub_unit_id}
            onOpenChange={(o) => setOpenRowId(o ? item.sub_unit_id : null)}
            onDelete={() => {
              setOpenRowId(null);
              remove(item.sub_unit_id);
            }}
            onQuantityChange={(q) => setQuantity(item.sub_unit_id, q)}
          />
        ))}
      </ul>

      <CheckoutBar
        totalQty={totalQty}
        totalAmount={totalAmount}
        onCheckout={handleCheckout}
      />
      <CheckoutSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        items={items}
        onOrderCreated={handleOrderCreated}
      />
    </>
  );
}

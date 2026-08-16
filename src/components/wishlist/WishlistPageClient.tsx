'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useWishlist } from '@/lib/wishlist';
import WishlistRow from './WishlistRow';
import CheckoutBar from './CheckoutBar';
import CheckoutSheet from './CheckoutSheet';

/** 挂载前骨架（localStorage 仅在浏览器可读，避免 SSR 水合不一致） */
function MountSkeleton() {
  return (
    <div className="space-y-3 px-5" aria-busy="true" aria-label="愿望单加载中">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-card border border-apple-border bg-apple-card p-4 shadow-card"
        >
          <div className="skeleton h-4 w-3/5 rounded-md" />
          <div className="mt-3 flex items-center justify-between">
            <div className="skeleton h-8 w-[112px] rounded-btn" />
            <div className="skeleton h-5 w-16 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 空状态：插图 + 文案 + 跳转选购 */
function EmptyWishlist() {
  return (
    <div className="flex flex-col items-center px-8 pb-16 pt-20 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-apple-card shadow-card">
        <Heart className="h-8 w-8 text-apple-text-3" strokeWidth={1.4} aria-hidden />
      </div>
      <h2 className="text-[22px] font-semibold tracking-tight text-apple-text">
        愿望单还是空的
      </h2>
      <p className="mt-2 text-[13px] text-apple-text-2">快去选购心仪的商品吧</p>
      <Link
        href="/"
        className="mt-7 rounded-btn bg-apple-blue px-8 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.3)] transition-colors duration-200 ease-apple hover:bg-apple-blue-hover active:bg-apple-blue-active"
      >
        去选购
      </Link>
    </div>
  );
}

/**
 * 愿望单页主体：
 * - 列表（数量步进 / 小计 / 左滑删除 / 垃圾桶删除）
 * - 「清空愿望单」二次确认（3 秒未确认自动还原）
 * - 底部悬浮结算栏 + 结算弹窗
 * - 数据持久化在 localStorage（wishlist store），刷新不丢失
 */
export default function WishlistPageClient() {
  const { items, remove, setQuantity, clear } = useWishlist();

  const [mounted, setMounted] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  /** 清空两步确认：第一次点击变为「确认清空？」，3 秒内再点才真正清空 */
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

  /**
   * 结算分发：
   * - 仅 1 件（1 种 × 数量 1）且有付款链接 → 新标签页直跳
   * - 其余情况 → 弹窗逐笔引导（避免浏览器拦截多弹窗）
   */
  const handleCheckout = () => {
    if (items.length === 1 && totalQty === 1) {
      const url = items[0].payment_url;
      if (url) {
        window.open(url, '_blank', 'noopener');
        return;
      }
    }
    setSheetOpen(true);
  };

  if (!mounted) return <MountSkeleton />;
  if (items.length === 0) return <EmptyWishlist />;

  return (
    <>
      {/* 列表头：统计 + 清空 */}
      <div className="flex items-center justify-between px-6 pb-3">
        <span className="text-[13px] text-apple-text-2">
          {items.length} 种商品 · 共 {totalQty} 件
        </span>
        <button
          type="button"
          onClick={handleClearClick}
          className={`text-[13px] font-medium transition-colors duration-200 ease-apple ${
            confirmClear ? 'text-[#FF3B30]' : 'text-apple-text-3 hover:text-apple-text-2'
          }`}
        >
          {confirmClear ? '确认清空？' : '清空愿望单'}
        </button>
      </div>

      {/* 商品列表（底部预留结算栏 + TabBar 高度） */}
      <ul className="space-y-3 px-5 pb-[calc(140px+env(safe-area-inset-bottom))]">
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
      />
    </>
  );
}

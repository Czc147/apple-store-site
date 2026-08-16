'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { WishlistItem } from '@/lib/wishlist';
import { formatPrice } from '@/lib/format';
import QuantityStepper from './QuantityStepper';

/** 左滑露出的删除区宽度（px） */
const REVEAL_WIDTH = 76;

interface WishlistRowProps {
  item: WishlistItem;
  /** 父级协调：同一时间只允许一行处于滑开状态 */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  onQuantityChange: (quantity: number) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 愿望单行：
 * - 名称 / 单价 / 数量步进器 / 小计 / 垃圾桶按钮
 * - 左滑露出红色删除区（iOS 式），滑动超过一半自动吸附
 * - touch-action: pan-y 保证纵向滚动不受影响
 */
export default function WishlistRow({
  item,
  open,
  onOpenChange,
  onDelete,
  onQuantityChange,
}: WishlistRowProps) {
  const [offset, setOffset] = useState(open ? -REVEAL_WIDTH : 0);
  const [dragging, setDragging] = useState(false);

  const start = useRef({ x: 0, y: 0, offset: 0 });
  const axis = useRef<'h' | 'v' | null>(null);
  const didDrag = useRef(false);

  // 父级开合状态变化时（例如打开了别的行）同步归位
  useEffect(() => {
    setOffset(open ? -REVEAL_WIDTH : 0);
  }, [open]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    setDragging(true);
    didDrag.current = false;
    axis.current = null;
    start.current = { x: t.clientX, y: t.clientY, offset };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;

    // 首次超过阈值时锁定滑动方向，避免与页面滚动打架
    if (!axis.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (axis.current === 'v') return;

    didDrag.current = true;
    setOffset(clamp(start.current.offset + dx, -REVEAL_WIDTH, 0));
  };

  const handleTouchEnd = () => {
    setDragging(false);
    if (axis.current === 'h') {
      const shouldOpen = offset < -REVEAL_WIDTH / 2;
      setOffset(shouldOpen ? -REVEAL_WIDTH : 0);
      onOpenChange(shouldOpen);
    }
    axis.current = null;
  };

  /** 点击内容区：若刚发生过拖拽则吞掉；若处于滑开态则收回 */
  const handleContentClick = () => {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    if (open) onOpenChange(false);
  };

  const subtotal = item.price * item.quantity;

  return (
    <li className="relative overflow-hidden rounded-card shadow-card">
      {/* 左滑露出的删除区 */}
      <button
        type="button"
        onClick={onDelete}
        aria-label={`删除「${item.name}」`}
        className="absolute inset-y-0 right-0 flex w-[76px] items-center justify-center bg-[#FF3B30] text-white"
      >
        <Trash2 className="h-5 w-5" strokeWidth={1.8} aria-hidden />
      </button>

      {/* 可滑动的内容卡片 */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClick={handleContentClick}
        style={{
          transform: `translateX(${offset}px)`,
          touchAction: 'pan-y',
        }}
        className={`relative border border-apple-border bg-apple-card px-4 py-3.5 ${
          dragging ? '' : 'transition-transform duration-200 ease-apple'
        }`}
      >
        {/* 第一行：名称 + 删除按钮（桌面端无滑动，提供显式入口） */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium leading-snug text-apple-text">
              {item.name}
            </div>
            <div className="mt-0.5 text-[12px] tabular-nums text-apple-text-3">
              单价 {formatPrice(item.price)}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={`删除「${item.name}」`}
            title="删除"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-apple-text-3 transition-colors duration-200 ease-apple hover:bg-apple-bg hover:text-[#FF3B30] active:scale-90"
          >
            <Trash2 className="h-[17px] w-[17px]" strokeWidth={1.7} aria-hidden />
          </button>
        </div>

        {/* 第二行：数量步进器 + 小计 */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <QuantityStepper value={item.quantity} onChange={onQuantityChange} />
          <div className="text-right">
            <div className="text-[11px] text-apple-text-3">小计</div>
            <div className="text-[15px] font-semibold tabular-nums text-apple-text">
              {formatPrice(subtotal)}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

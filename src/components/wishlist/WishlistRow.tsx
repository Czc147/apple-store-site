'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { WishlistItem } from '@/lib/wishlist';
import { formatPrice } from '@/lib/format';
import IconButton from '@/components/ui/IconButton';
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
 * 封面降级（§11 图片降级：无封面用「品牌浅灰底 + 名称缩写」）。
 * 愿望单条目只存 id/名称/价格，没有封面字段——按规范前端降级，
 * 不为此新增后端字段，也不伪造图片。
 */
function CoverTile({ name }: { name: string }) {
  const initial = name.trim().slice(0, 1) || '·';
  return (
    <div
      aria-hidden
      className="flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-input bg-apple-bg"
    >
      <span className="text-xl font-semibold leading-none text-apple-text-3">{initial}</span>
    </div>
  );
}

/**
 * 愿望单行（§8.2 收藏画廊）：大封面 + 名称/单价/小计层级分明 + 弱化但好点的数量控制。
 * - 无玻璃（§3.3：愿望单普通行禁用 Premium Glass），层级只靠白底 + 圆角表达；
 * - 封面 80px 方形砖（无封面字段 → 名称缩写降级）；
 * - 名称（text-md）为第一层级、单价弱化（text-xs 灰）、小计为价格主层级（text-lg 半粗）；
 * - 删除两入口：右侧 44pt 垃圾桶（IconButton primitive）+ 左滑露出 danger 删除区；
 * - 左滑物理原样保留（touch-action: pan-y、方向锁、过半吸附）。
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
    <li className="relative overflow-hidden rounded-card">
      {/* 左滑露出的删除区（宽度与吸附阈值同用 REVEAL_WIDTH）。
          它是行内删除钮的触摸快捷方式，不进 Tab 序 / 不重复播报：
          键盘与读屏用户走右侧常驻的 IconButton（同一动作，无需先左滑）。 */}
      <button
        type="button"
        onClick={onDelete}
        tabIndex={-1}
        aria-hidden
        style={{ width: REVEAL_WIDTH }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-apple-danger text-white transition-colors duration-fast ease-apple hover:bg-apple-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
      >
        <Trash2 className="h-5 w-5" strokeWidth={1.8} aria-hidden />
      </button>

      {/* 可滑动的内容卡片：白底 + 20px 圆角，不用投影与描边（背景差异表达层级） */}
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
        className={`relative flex items-center gap-3.5 bg-apple-card p-3.5 ${
          dragging ? '' : 'transition-transform duration-base ease-apple'
        }`}
      >
        <CoverTile name={item.name} />

        <div className="min-w-0 flex-1">
          {/* 名称（第一层级）+ 单价（弱化） */}
          <p className="truncate text-md font-medium leading-snug text-apple-text">
            {item.name}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-apple-text-3">
            单价 {formatPrice(item.price)}
          </p>

          {/* 数量控制（弱化，44pt 命中）+ 小计（价格主层级）
              移动端左右撑开、桌面起成组靠右（跟删除入口同一侧，避免大屏视线来回跳） */}
          <div className="mt-2.5 flex items-center justify-between gap-3 sm:justify-end sm:gap-6">
            <QuantityStepper value={item.quantity} onChange={onQuantityChange} />
            <div className="text-right">
              <div className="text-2xs leading-none text-apple-text-3">小计</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-apple-text">
                {formatPrice(subtotal)}
              </div>
            </div>
          </div>
        </div>

        {/* 删除入口（IconButton primitive：视觉圆 32px + 44pt 命中区） */}
        <IconButton
          icon={Trash2}
          label={`删除「${item.name}」`}
          onClick={onDelete}
          className="-mr-1.5"
        />
      </div>
    </li>
  );
}

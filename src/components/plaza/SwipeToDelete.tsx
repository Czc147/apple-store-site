'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/** 删除按钮露出的宽度（px） */
const ACTION_W = 84;
/** 判定为横向滑动的最小位移，小于它当作点击 */
const ENGAGE_PX = 8;
/** 松手后超过这个比例就停在展开态 */
const OPEN_RATIO = 0.4;

/**
 * 左滑露出删除按钮（iOS 列表那套）。
 *
 * 为什么必须要有：原来会话行上的删除是个 `group-hover` 才显形的 ✕ ——
 * **触屏上根本没有 hover，手机上永远看不到它**，等于删不掉好友/会话。
 * 滑动是触屏列表删除的标准手势，这里补上。
 *
 * 几个容易做错的点：
 * - **先判方向**：`|dx| > |dy|` 才接管，否则用户只是想上下滚动列表，
 *   却被判成滑动、行卡在半开状态
 * - **`touch-action: pan-y`**：显式让浏览器保留纵向滚动，只把横向交给 JS；
 *   不写的话移动端要么整行不跟手、要么整页都滑不动
 * - **展开态下点击行 = 收起**，不能既收起又跳转
 * - 同一时刻只允许一行展开：展开状态由父级持有（`open` / `onOpenChange`），
 *   各行自己存的话会同时开好几个
 */
export default function SwipeToDelete({
  children,
  onDelete,
  open,
  onOpenChange,
  confirmText = '删除',
  disabled = false,
}: {
  children: ReactNode;
  onDelete: () => void;
  /** 是否处于展开态（由父级统一管理） */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmText?: string;
  disabled?: boolean;
}) {
  const [dx, setDx] = useState(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  /** 本次手势是否已经判定为横向滑动 */
  const engagedRef = useRef(false);
  const movedRef = useRef(false);

  // 外部把 open 改掉时，位移要跟着归位
  useEffect(() => {
    setDx(open ? -ACTION_W : 0);
  }, [open]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      startRef.current = { x: e.clientX, y: e.clientY };
      engagedRef.current = false;
      movedRef.current = false;
    },
    [disabled],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start || disabled) return;

      const mx = e.clientX - start.x;
      const my = e.clientY - start.y;

      if (!engagedRef.current) {
        // 还没判定方向：位移太小就继续等
        if (Math.abs(mx) < ENGAGE_PX && Math.abs(my) < ENGAGE_PX) return;
        // 纵向为主 → 交还给列表滚动，本次手势不再接管
        if (Math.abs(my) > Math.abs(mx)) {
          startRef.current = null;
          return;
        }
        engagedRef.current = true;
      }

      movedRef.current = true;
      const base = open ? -ACTION_W : 0;
      // 只往左拉；右边最多回到 0（不回弹出白边）
      const next = Math.min(0, Math.max(-ACTION_W, base + mx));
      setDx(next);
    },
    [disabled, open],
  );

  const onPointerUp = useCallback(() => {
    if (startRef.current && engagedRef.current) {
      onOpenChange(dx < -ACTION_W * OPEN_RATIO);
    }
    startRef.current = null;
    engagedRef.current = false;
  }, [dx, onOpenChange]);

  /** 展开态下点内容 = 收起（并阻止这次点击继续往下传，免得同时又跳转了） */
  const onClickCapture = useCallback(
    (e: React.MouseEvent) => {
      if (movedRef.current) {
        // 这是滑动结束的那一下，不该当成点击
        e.preventDefault();
        e.stopPropagation();
        movedRef.current = false;
        return;
      }
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange(false);
      }
    },
    [open, onOpenChange],
  );

  return (
    <div className="relative overflow-hidden rounded-card-lg">
      {/* 底层：删除按钮 */}
      <button
        type="button"
        onClick={onDelete}
        aria-label={confirmText}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        className={cn(
          'absolute inset-y-0 right-0 flex w-[84px] flex-col items-center justify-center gap-1',
          'bg-apple-danger text-white transition-opacity duration-fast',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <Trash2 className="h-5 w-5" aria-hidden />
        <span className="text-2xs font-medium">{confirmText}</span>
      </button>

      {/* 上层：可滑动的内容 */}
      <div
        className="relative touch-pan-y"
        style={{
          transform: `translateX(${dx}px)`,
          // 拖动中不加过渡（要跟手），松手才用缓动归位
          transition: engagedRef.current ? 'none' : 'transform 220ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}

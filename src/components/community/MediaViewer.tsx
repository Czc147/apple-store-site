'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import IconButton from '@/components/ui/IconButton';
import CoverImage from '@/components/ui/CoverImage';
import { cn } from '@/lib/cn';

/** 滑动切图的最小位移（px）—— 太小会被手指抖动误触发 */
const SWIPE_THRESHOLD = 60;
/** 缩放上下限：放到 1 倍以下没意义，放到 5 倍以上就全是马赛克 */
const MIN_SCALE = 1;
const MAX_SCALE = 4;

interface MediaViewerProps {
  images: string[];
  /** 打开时显示第几张 */
  index: number;
  onClose: () => void;
}

/**
 * 图片全屏查看器（UI.docx 第 26 条）。
 *
 * 文档要求：全屏黑底、图片居中、双指缩放、左右滑动、点击关闭。
 * 全部用裸 touch 事件实现，不引第三方手势库 —— 只支持这几个动作，
 * 引一个库反而要跟它的默认行为打架（尤其是它自带的滚动/回弹）。
 *
 * 几个容易漏的点：
 * - 打开期间**锁 body 滚动**，否则背景会跟着手指滑
 * - 放大状态下**不响应左右滑**（那是在平移看图，不是翻页）
 * - iOS 上要 `touch-action: none`，不然浏览器会自己接管双指缩放
 */
export default function MediaViewer({ images, index, onClose }: MediaViewerProps) {
  const [mounted, setMounted] = useState(false);
  const [current, setCurrent] = useState(index);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);

  // 手势过程中的临时状态放 ref：它们每帧都在变，进 state 会把渲染打爆
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartScale = useRef(1);
  const swipeStartX = useRef<number | null>(null);
  const dragged = useRef(false);

  useEffect(() => setMounted(true), []);

  // 锁滚动 + Esc 关闭 + 左右方向键翻页
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, current, images.length]);

  /** 切到上/下一张；到边界就停在原地（不循环，避免"怎么又回来了"的困惑） */
  const go = (delta: number) => {
    setCurrent((c) => {
      const next = c + delta;
      if (next < 0 || next >= images.length) return c;
      setScale(1);
      setOffsetX(0);
      return next;
    });
  };

  const distance = (touches: React.TouchList) =>
    Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );

  const onTouchStart = (e: React.TouchEvent) => {
    dragged.current = false;
    if (e.touches.length === 2) {
      pinchStartDist.current = distance(e.touches);
      pinchStartScale.current = scale;
    } else if (e.touches.length === 1 && scale === 1) {
      swipeStartX.current = e.touches[0].clientX;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist.current) {
      e.preventDefault();
      dragged.current = true;
      const ratio = distance(e.touches) / pinchStartDist.current;
      const next = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, pinchStartScale.current * ratio),
      );
      setScale(next);
      if (next === 1) setOffsetX(0);
      return;
    }
    if (e.touches.length === 1 && swipeStartX.current !== null) {
      const dx = e.touches[0].clientX - swipeStartX.current;
      if (Math.abs(dx) > 8) dragged.current = true;
      setOffsetX(dx); // 跟手位移，松手再决定是翻页还是弹回
    }
  };

  const onTouchEnd = () => {
    if (pinchStartDist.current !== null) {
      pinchStartDist.current = null;
      return;
    }
    if (swipeStartX.current !== null) {
      const dx = offsetX;
      swipeStartX.current = null;
      setOffsetX(0);
      if (dx <= -SWIPE_THRESHOLD) go(1);
      else if (dx >= SWIPE_THRESHOLD) go(-1);
    }
  };

  if (!mounted) return null;

  const total = images.length;

  return createPortal(
    <div
      className="fixed inset-0 z-lightbox flex flex-col bg-black/96 animate-fade-in"
      style={{ touchAction: 'none' }}
      role="dialog"
      aria-modal="true"
      aria-label={`图片查看 ${current + 1} / ${total}`}
    >
      {/* 顶部：计数 + 关闭 */}
      <div className="flex items-center justify-between px-3 pt-[calc(env(safe-area-inset-top)+8px)]">
        <span className="text-sm tabular-nums text-white/80">
          {total > 1 ? `${current + 1} / ${total}` : ''}
        </span>
        <IconButton
          icon={X}
          label="关闭"
          variant="on-dark"
          iconSize="md"
          onClick={onClose}
        />
      </div>

      {/* 图片区：点击空白处关闭（拖动过就不关，否则滑完手指一抬就没了） */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onClick={() => {
          if (!dragged.current) onClose();
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {total > 1 && (
          <>
            <button
              type="button"
              aria-label="上一张"
              disabled={current === 0}
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              className="absolute left-2 z-10 hidden h-11 w-11 items-center justify-center rounded-full text-white/80 transition-colors hover:text-white disabled:opacity-30 sm:flex"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="下一张"
              disabled={current === total - 1}
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              className="absolute right-2 z-10 hidden h-11 w-11 items-center justify-center rounded-full text-white/80 transition-colors hover:text-white disabled:opacity-30 sm:flex"
            >
              <ChevronRight className="h-6 w-6" aria-hidden />
            </button>
          </>
        )}

        <div
          className={cn(
            'transition-transform',
            swipeStartX.current === null && 'duration-base ease-apple',
          )}
          style={{
            transform: `translateX(${offsetX}px) scale(${scale})`,
          }}
        >
          <CoverImage
            src={images[current]}
            alt={`图片 ${current + 1}`}
            ratio="photo"
            sizes="96vw"
            className="max-h-[80vh] w-auto rounded-none"
          />
        </div>
      </div>

      {/* 缩放提示：只在能缩放时轻提示一次，常驻会显得啰嗦 */}
      {total > 1 && scale === 1 && (
        <p className="pb-[calc(env(safe-area-inset-bottom)+12px)] text-center text-2xs text-white/50">
          双指缩放 · 左右滑动切换 · 点击空白关闭
        </p>
      )}
    </div>,
    document.body,
  );
}

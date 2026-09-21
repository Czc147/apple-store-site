'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import IconButton from './IconButton';
import { cn } from '@/lib/cn';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** 无标题时隐藏关闭钮（内容自带操作区） */
  hideClose?: boolean;
  /** 面板附加类 */
  className?: string;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * 统一底部弹层（Brief §12：Navigation/Sheet 层级独立）。
 * audit 收敛：CheckoutSheet / ServiceButton / ProfileEditSheet 三处
 * 近逐字重复的手搓弹层（遮罩浓度、宽度、时长、z 序、滚动锁恢复各不相同，
 * 且都没走 Portal、没有焦点管理）。
 * 规约：Portal + scrim-sheet 遮罩 + z-sheet + 真·底部滑入（animate-sheet-in，
 * apple-sheet 曲线 300ms）+ 面板实底白（a7863fa 变灰事故教训，禁半透明面板）+
 * 内容区避开 TabBar（--tabbar-h 变量）+ Esc/点遮罩关闭 + 焦点圈定在面板内。
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  hideClose,
  className,
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // 简易焦点陷阱：Tab 在面板内循环
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-sheet flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? '弹层'}
    >
      <div className="scrim-sheet animate-fade-in absolute inset-0" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'animate-sheet-in relative flex max-h-[88dvh] w-full max-w-sheet flex-col overflow-hidden',
          'rounded-hero bg-apple-card shadow-popover focus:outline-none',
          className,
        )}
      >
        {/* 抓手条 */}
        <div className="mx-auto mt-2.5 h-1 w-9 flex-none rounded-full bg-apple-border" aria-hidden />
        {(title || !hideClose) && (
          <div className="flex flex-none items-center justify-between gap-3 px-6 pb-1.5 pt-2">
            {title ? (
              <h2 className="min-w-0 truncate text-md font-semibold tracking-tight text-apple-text">
                {title}
              </h2>
            ) : (
              <span aria-hidden />
            )}
            {!hideClose && (
              <IconButton icon={X} label="关闭" onClick={onClose} variant="filled" className="-mr-2" />
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

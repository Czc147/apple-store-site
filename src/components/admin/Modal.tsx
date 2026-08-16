'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * 通用弹窗：移动端底部抽屉、桌面端居中卡片。
 * 支持点击遮罩 / Esc 关闭；打开时锁定页面滚动。
 */
export default function Modal({ open, title, onClose, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="animate-fade-in absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div className="animate-sheet-in relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-card-lg bg-apple-card shadow-popover sm:animate-pop-in sm:max-w-lg sm:rounded-card-lg">
        <div className="flex items-center justify-between border-b border-apple-hairline px-5 py-4">
          <h2 className="text-[16px] font-semibold text-apple-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-full text-apple-text-2 transition hover:bg-apple-bg active:scale-95"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 border-t border-apple-hairline px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

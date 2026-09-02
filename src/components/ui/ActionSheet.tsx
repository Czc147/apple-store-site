'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';

interface ActionSheetProps {
  open: boolean;
  /** 弹层标题（粗体居左，如 iOS 通讯录弹层顶部） */
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * iOS 风格居中弹层（对标系统通讯录弹层）：
 * - 背景压暗 + 轻模糊，与页面内容形成色差
 * - 居中大圆角白色面板，scale 弹入
 * - 点击遮罩 / Esc 关闭；打开时锁定页面滚动
 * - Portal 挂到 body，避免祖先 transform 影响 fixed 定位
 */
export default function ActionSheet({ open, title, onClose, children }: ActionSheetProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? '详情'}
    >
      <div
        className="animate-fade-in absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div className="animate-pop-in relative max-h-[80dvh] w-full max-w-[360px] overflow-y-auto rounded-hero bg-white/95 shadow-popover backdrop-blur-xl">
        {title && (
          <h2 className="px-6 pb-4 pt-6 text-[17px] font-bold leading-snug tracking-tight text-apple-text">
            {title}
          </h2>
        )}
        {children}
        {/* 底部安全留白 */}
        <div className="h-4" aria-hidden />
      </div>
    </div>,
    document.body,
  );
}

interface SheetItemProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** 传入则整行为新标签页链接 */
  href?: string;
  onClick?: () => void;
}

/** 弹层列表行：图标 + 标题 + 副标题，右侧箭头（链接行） */
export function SheetItem({ icon: Icon, title, subtitle, href, onClick }: SheetItemProps) {
  const inner = (
    <>
      <Icon className="h-5 w-5 flex-none text-apple-text" strokeWidth={1.8} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-apple-text">
          {title}
        </span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[12px] text-apple-text-3">
            {subtitle}
          </span>
        )}
      </span>
      {href && <ChevronRight className="h-4 w-4 flex-none text-apple-text-3" aria-hidden />}
    </>
  );

  const cls =
    'flex w-full items-center gap-3.5 px-6 py-3.5 text-left transition active:bg-apple-bg';

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

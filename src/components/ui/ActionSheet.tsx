'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import ListRow from './ListRow';

interface ActionSheetProps {
  open: boolean;
  /** 弹层标题（粗体居左，如 iOS 通讯录弹层顶部） */
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * iOS 风格居中弹层（对标系统通讯录弹层）：
 * - scrim-sheet 统一遮罩，与页面内容形成色差
 * - 居中大圆角实底白面板，scale 弹入
 * - 点击遮罩 / Esc 关闭；打开时锁定页面滚动、焦点移入面板
 * - Portal 挂到 body，避免祖先 transform 影响 fixed 定位
 *
 * 材质防护（a7863fa 线上变灰事故）：面板必须实底 —— 旧版 bg-white/95 +
 * backdrop-blur-xl 是该修复的漏网之鱼，Chromium 线上合成会变灰；
 * 半透明材质只允许出现在导航层（.glass）与 premium 区（GlassSurface）。
 */
export default function ActionSheet({ open, title, onClose, children }: ActionSheetProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-sheet flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? '详情'}
    >
      <div className="scrim-sheet animate-fade-in absolute inset-0" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="animate-pop-in relative max-h-[80dvh] w-full max-w-dialog overflow-y-auto rounded-hero bg-apple-card shadow-popover focus:outline-none"
      >
        {title && (
          <h2 className="px-6 pb-4 pt-6 text-lg font-bold leading-snug tracking-tight text-apple-text">
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

/** 弹层列表行（API 不变，内部统一走 ListRow primitive） */
export function SheetItem({ icon: Icon, title, subtitle, href, onClick }: SheetItemProps) {
  return (
    <ListRow
      leading={<Icon className="h-5 w-5 flex-none text-apple-text" strokeWidth={1.8} aria-hidden />}
      title={title}
      subtitle={subtitle}
      trailing={href ? 'chevron' : undefined}
      href={href}
      external={Boolean(href)}
      onClick={onClick}
    />
  );
}

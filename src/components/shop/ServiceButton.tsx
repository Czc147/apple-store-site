'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Headphones, X } from 'lucide-react';

const QQ_NUMBER = '3821587061';

/**
 * 客服入口：右下角悬浮圆形按钮（位于 TabBar 上方）。
 * 点击从底部滑出毛玻璃卡片：联系客服 + QQ 号（可一键复制）。
 * 支持：点击遮罩关闭 / Esc 关闭 / 打开时锁定页面滚动。
 */
export default function ServiceButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const copyQQ = async () => {
    try {
      await navigator.clipboard.writeText(QQ_NUMBER);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 剪贴板不可用时忽略，用户可手动长按复制 */
    }
  };

  return (
    <>
      {/* 悬浮客服按钮 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="联系客服"
        className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-40 flex h-[52px] w-[52px] items-center justify-center rounded-full border border-white/60 glass shadow-popover transition-transform duration-200 ease-apple hover:scale-105 active:scale-95"
      >
        <Headphones className="h-6 w-6 text-apple-blue" strokeWidth={1.8} aria-hidden />
      </button>

      {/* 遮罩 + 底部滑出卡片（visibility 延迟切换保证退出动画完整且不挡交互） */}
      <div
        className={`fixed inset-0 z-[60] ${
          open
            ? 'visible'
            : 'invisible pointer-events-none [transition:visibility_0s_linear_250ms]'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-sheet-title"
      >
        {/* 遮罩 */}
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/25 transition-opacity duration-[250ms] ${
            open ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* 卡片（悬浮于 TabBar 上方） */}
        <div
          className={`absolute inset-x-4 bottom-[calc(72px+env(safe-area-inset-bottom))] mx-auto max-w-[420px] rounded-hero border border-white/60 glass p-6 pt-7 shadow-popover transition-[opacity,transform] duration-[250ms] ease-apple ${
            open ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          {/* Apple 式顶部抓手 */}
          <div
            className="absolute left-1/2 top-2.5 h-1 w-9 -translate-x-1/2 rounded-full bg-black/10"
            aria-hidden
          />

          {/* 关闭按钮 */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="关闭"
            className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-apple-text-2 transition-colors duration-200 hover:bg-black/10 active:scale-95"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>

          <h3
            id="service-sheet-title"
            className="text-center text-[17px] font-semibold tracking-tight"
          >
            联系客服
          </h3>
          <p className="mt-1 text-center text-[13px] text-apple-text-2">
            选购、订单或售后问题，欢迎随时联系
          </p>

          <div className="mt-5 flex items-center justify-between gap-3 rounded-card border border-apple-border bg-apple-bg px-4 py-3.5">
            <div className="min-w-0">
              <div className="text-[12px] text-apple-text-2">QQ</div>
              <div className="mt-0.5 text-[18px] font-semibold tabular-nums tracking-tight">
                {QQ_NUMBER}
              </div>
            </div>
            <button
              type="button"
              onClick={copyQQ}
              className={[
                'flex flex-none items-center gap-1.5 rounded-btn border px-4 py-2 text-[13px] font-medium',
                'transition-colors duration-200 ease-apple active:scale-[0.97]',
                copied
                  ? 'border-transparent bg-apple-success-soft text-apple-success'
                  : 'border-apple-border bg-white text-apple-text hover:border-apple-text-3',
              ].join(' ')}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden /> 已复制
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> 复制
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

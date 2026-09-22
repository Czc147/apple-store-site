'use client';

import { useState } from 'react';
import { Check, Copy, Headphones } from 'lucide-react';
import BottomSheet from '@/components/ui/BottomSheet';
import Button from '@/components/ui/Button';

// 客服 QQ 号：业务数据。迁入 app_settings 需要动后端配置，本次改版禁改后端，保留常量。
const QQ_NUMBER = '3821587061';

/**
 * 客服入口：右下角悬浮圆形按钮（Floating 层，z-panel，位于 TabBar 上方，
 * 偏移走 --tabbar-h 变量——原 76px 魔数）+ BottomSheet 统一底部弹层。
 * audit 收敛：原手搓弹层（非 Portal / 250ms 自成一套 / z-[60] / 遮罩 black/25 /
 * 32px 关闭钮 / 36px 复制钮）整体替换为 primitive，Esc/滚动锁/焦点陷阱由
 * BottomSheet 统一提供。
 */
export default function ServiceButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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
        className="glass fixed bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] right-4 z-panel flex h-[52px] w-[52px] items-center justify-center rounded-full border border-white/60 shadow-popover pressable hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
      >
        <Headphones className="h-6 w-6 text-apple-blue" strokeWidth={1.8} aria-hidden />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="联系客服">
        <div className="px-6 pb-4 pt-1">
          <p className="text-sm leading-relaxed text-apple-text-2">
            选购、订单或售后问题，欢迎随时联系
          </p>

          <div className="mt-5 flex items-center justify-between gap-3 rounded-card border border-apple-border bg-apple-bg px-4 py-3.5">
            <div className="min-w-0">
              <div className="text-xs text-apple-text-2">QQ</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-apple-text">
                {QQ_NUMBER}
              </div>
            </div>
            <Button
              variant={copied ? 'success' : 'secondary'}
              size="sm"
              onClick={copyQQ}
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
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}

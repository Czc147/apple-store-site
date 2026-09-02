'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 复制按钮：点击将文本写入剪贴板，短暂显示「已复制」。
 * 优先 navigator.clipboard；不可用时（非安全上下文等）降级为隐藏选区复制。
 */
export default function CopyButton({
  text,
  label = '复制',
  className = '',
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const markCopied = () => {
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      markCopied();
    } catch {
      // 降级方案：临时选区 + execCommand（旧浏览器 / 非安全上下文）
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        markCopied();
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] font-medium transition active:scale-95 ${
        copied
          ? 'text-[#1B7F3B]'
          : 'text-apple-blue hover:bg-apple-blue-soft/60 hover:text-apple-blue-hover'
      } ${className}`}
    >
      {copied ? '已复制' : label}
    </button>
  );
}

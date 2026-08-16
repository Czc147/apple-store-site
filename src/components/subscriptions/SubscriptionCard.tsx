'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/format';
import type { Subscription } from '@/lib/types';

interface SubscriptionCardProps {
  subscription: Subscription;
}

/**
 * 订阅卡片：时长徽章 + 名称（粗体）+ 大号价格 + 「立即订阅」按钮。
 * 点击按钮 → 短暂加载反馈 → 新标签页打开 payment_url（noopener 隔离）。
 */
export default function SubscriptionCard({ subscription }: SubscriptionCardProps) {
  const [loading, setLoading] = useState(false);
  const { name, price, duration, payment_url } = subscription;
  const hasUrl = Boolean(payment_url);

  const handleSubscribe = () => {
    if (!payment_url || loading) return;
    setLoading(true);
    // 短暂 loading 反馈后再跳转，避免点击瞬间无响应感
    window.setTimeout(() => {
      window.open(payment_url, '_blank', 'noopener');
      setLoading(false);
    }, 350);
  };

  return (
    <article className="flex flex-col rounded-card border border-apple-border bg-apple-card p-5 shadow-card">
      {/* 时长徽章 */}
      <div className="flex h-6 items-center">
        {duration && (
          <span className="rounded-full bg-apple-blue-soft px-2.5 py-1 text-[12px] font-medium leading-none text-apple-blue">
            {duration}
          </span>
        )}
      </div>

      {/* 订阅名称 */}
      <h2 className="mt-3 text-[17px] font-semibold leading-snug text-apple-text">
        {name}
      </h2>

      {/* 价格 */}
      <p className="mt-2.5 text-[32px] font-semibold leading-none tracking-tight text-apple-text">
        {formatPrice(price)}
      </p>

      {/* 弹性占位：多列布局时让按钮底部对齐 */}
      <div className="min-h-6 flex-1" />

      <button
        type="button"
        onClick={handleSubscribe}
        disabled={!hasUrl || loading}
        aria-label={`立即订阅 ${name}`}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-btn bg-apple-blue text-[15px] font-medium text-white hover:bg-apple-blue-hover active:scale-[0.98] [transition:transform_100ms_cubic-bezier(0.4,0,0.2,1),background-color_200ms_cubic-bezier(0.4,0,0.2,1)] disabled:cursor-not-allowed disabled:bg-apple-border disabled:text-apple-text-2 disabled:hover:bg-apple-border"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            正在打开…
          </>
        ) : (
          '立即订阅'
        )}
      </button>

      {!hasUrl && (
        <p className="mt-2 text-center text-[12px] text-apple-text-3">
          暂未开放订阅
        </p>
      )}
    </article>
  );
}

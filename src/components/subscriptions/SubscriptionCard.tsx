'use client';

import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { formatPrice } from '@/lib/format';
import type { Subscription } from '@/lib/types';
import ActionSheet, { SheetItem } from '@/components/ui/ActionSheet';

interface SubscriptionCardProps {
  subscription: Subscription;
}

/**
 * 订阅卡片（两列网格版）：时长徽章 + 名称（粗体）+ 价格 + 「查看详情」。
 * 点击整卡打开 iOS 风格弹层：价格 / 时长 + 后台「详细介绍」+ 立即订阅入口。
 * （弹层不展示兑换商品——兑换内容仅在卡密兑换后出现）
 */
export default function SubscriptionCard({ subscription }: SubscriptionCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { name, price, duration, description, payment_url } = subscription;
  const hasUrl = Boolean(payment_url);

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-haspopup="dialog"
        aria-label={`查看「${name}」详细介绍`}
        className="flex w-full flex-col rounded-card border border-apple-border bg-apple-card p-4 text-left shadow-card hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.97] [transition:transform_100ms_cubic-bezier(0.4,0,0.2,1),box-shadow_200ms_cubic-bezier(0.4,0,0.2,1)]"
      >
        {/* 时长徽章 */}
        <div className="flex h-6 items-center">
          {duration && (
            <span className="rounded-full bg-apple-blue-soft px-2.5 py-1 text-[11px] font-medium leading-none text-apple-blue">
              {duration}
            </span>
          )}
        </div>

        {/* 订阅名称 */}
        <h2 className="mt-2 line-clamp-2 text-[14px] font-semibold leading-snug text-apple-text sm:text-[15px]">
          {name}
        </h2>

        {/* 价格 */}
        <p className="mt-2 text-[24px] font-semibold leading-none tracking-tight text-apple-text">
          {formatPrice(price)}
        </p>

        <span className="mt-3 inline-flex items-center gap-px text-[12.5px] font-medium text-apple-blue">
          查看详情 <span aria-hidden>›</span>
        </span>
      </button>

      <ActionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={name}>
        {/* 价格 + 时长 */}
        <div className="flex items-center gap-2.5 px-6 pb-1">
          <p className="text-[28px] font-semibold leading-none tracking-tight text-apple-text">
            {formatPrice(price)}
          </p>
          {duration && (
            <span className="rounded-full bg-apple-blue-soft px-2.5 py-1 text-[12px] font-medium leading-none text-apple-blue">
              {duration}
            </span>
          )}
        </div>

        {/* 详细介绍 */}
        {description ? (
          <p className="whitespace-pre-line px-6 pb-4 pt-3 text-[13.5px] leading-relaxed text-apple-text-2">
            {description}
          </p>
        ) : (
          <p className="px-6 pb-4 pt-3 text-[13px] text-apple-text-3">
            暂无详细介绍
          </p>
        )}

        <div className="border-t border-apple-hairline">
          {hasUrl ? (
            <SheetItem
              icon={CreditCard}
              title="立即订阅"
              subtitle="在新标签页打开付款链接"
              href={payment_url!}
            />
          ) : (
            <p className="px-6 py-4 text-center text-[12px] text-apple-text-3">
              暂未开放订阅
            </p>
          )}
        </div>
      </ActionSheet>
    </>
  );
}

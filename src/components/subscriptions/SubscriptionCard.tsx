'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { formatPrice } from '@/lib/format';
import type { Subscription } from '@/lib/types';
import type { PaymentMethod } from '@/lib/order-types';
import ActionSheet, { SheetItem } from '@/components/ui/ActionSheet';
import PaymentMethodBody from '@/components/checkout/PaymentMethodBody';

interface SubscriptionCardProps {
  subscription: Subscription;
}

/**
 * 订阅卡片（两列网格版）：时长徽章 + 名称（粗体）+ 价格 + 「查看详情」。
 * 点击整卡打开 iOS 风格弹层：价格 / 时长 + 详细介绍 + 「立即订阅」结算弹窗
 * （内置微信/支付宝收款码 + 推送订单，走本站订单闭环，不再外跳酷发卡）。
 */
export default function SubscriptionCard({ subscription }: SubscriptionCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pushedOrder, setPushedOrder] = useState<string | null>(null);
  const { name, price, duration, description, link_url } = subscription;
  const hasLink = Boolean(link_url);

  const buildBody = (method: PaymentMethod) => ({
    items: [
      { ref_type: 'subscription' as const, ref_id: subscription.id, quantity: 1 },
    ],
    payment_method: method,
  });

  const handleOrderCreated = (orderNo: string) => {
    setSheetOpen(false);
    setPushedOrder(orderNo);
  };

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

      {/* 推送成功提示 */}
      {pushedOrder && (
        <div className="mt-3 rounded-card border border-[#1B7F3B]/25 bg-[#E8F5E9] p-3.5">
          <p className="text-[13.5px] font-semibold text-apple-text">订阅已成功推送</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-apple-text-2">
            订单号 {pushedOrder}。我们确认收款后会自动解锁订阅，您可在「我的库」查看。
          </p>
        </div>
      )}

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
          <p className="px-6 pb-4 pt-3 text-[13px] text-apple-text-3">暂无详细介绍</p>
        )}

        <div className="border-t border-apple-hairline px-5 pb-3 pt-4">
          <PaymentMethodBody
            total={price}
            buildBody={buildBody}
            onSuccess={handleOrderCreated}
            loginFrom="/subscription"
          />
          {hasLink && (
            <SheetItem
              icon={ExternalLink}
              title="了解更多"
              subtitle="在新标签页打开链接"
              href={link_url!}
            />
          )}
        </div>
      </ActionSheet>
    </>
  );
}

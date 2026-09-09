'use client';

import { useState } from 'react';
import Badge from '@/components/ui/Badge';
import Surface from '@/components/ui/Surface';
import Message from '@/components/ui/Message';
import SubscriptionPurchaseSheet from './SubscriptionPurchaseSheet';
import { formatPrice } from '@/lib/format';
import type { Subscription } from '@/lib/types';

/**
 * 订阅卡片（网格常规档）：时长徽章 + 名称 + 价格 + 「查看详情」。
 * 整卡点击打开 SubscriptionPurchaseSheet（详情 + 收款码 + 推送订单）。
 * audit 收敛：卡壳/徽章/字号/按压/成功条全部改走 token 与 primitives
 * （原版 9 档任意字号 + 手写 transition + 私有绿 #1B7F3B 成功条）。
 */
export default function SubscriptionCard({ subscription }: { subscription: Subscription }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pushedOrder, setPushedOrder] = useState<string | null>(null);
  const { name, price, duration } = subscription;

  return (
    <>
      <Surface
        as="button"
        interactive
        onClick={() => setSheetOpen(true)}
        aria-label={`查看「${name}」详细介绍`}
        className="flex w-full flex-col p-4 text-left"
      >
        {/* 时长徽章 */}
        <div className="flex h-6 items-center">
          {duration && <Badge tone="blue">{duration}</Badge>}
        </div>

        {/* 订阅名称 */}
        <h2 className="mt-2 line-clamp-2 text-base font-semibold leading-snug text-apple-text">
          {name}
        </h2>

        {/* 价格 */}
        <p className="mt-2 text-xl font-semibold leading-none tracking-tight text-apple-text">
          {formatPrice(price)}
        </p>

        <span className="mt-3 inline-flex items-center gap-px text-xs font-medium text-apple-blue">
          查看详情 <span aria-hidden>›</span>
        </span>
      </Surface>

      {/* 推送成功提示 */}
      {pushedOrder && (
        <Message tone="success" title="订阅已成功推送" className="mt-3">
          订单号 {pushedOrder}。我们确认收款后会自动解锁订阅，您可在「我的库」查看。
        </Message>
      )}

      <SubscriptionPurchaseSheet
        subscription={subscription}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPushed={(orderNo) => {
          setSheetOpen(false);
          setPushedOrder(orderNo);
        }}
      />
    </>
  );
}

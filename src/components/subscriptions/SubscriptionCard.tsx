'use client';

import { useState } from 'react';
import Badge from '@/components/ui/Badge';
import Surface from '@/components/ui/Surface';
import Message from '@/components/ui/Message';
import SubscriptionPurchaseSheet from './SubscriptionPurchaseSheet';
import VipBenefitBadges from './VipBenefitBadges';
import { formatPrice } from '@/lib/format';
import type { Subscription } from '@/lib/types';

/**
 * 订阅卡片（网格安静档 · §6.9 默认状态：白底、发丝线、无重阴影）。
 * 时长徽章 + 名称 + 价格（第一层级）+「查看详情」；
 * 整卡点击打开 SubscriptionPurchaseSheet（详情 + 收款码 + 推送订单）。
 * 已拥有（owns）时打「已拥有」徽章，CTA 文案改「续费」。
 * 玻璃材质只留给主推方案（SubscriptionMegaCard），这里保持克制。
 */
export default function SubscriptionCard({
  subscription,
  owned = false,
}: {
  subscription: Subscription;
  owned?: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pushedOrder, setPushedOrder] = useState<string | null>(null);
  const { name, price, duration } = subscription;

  return (
    <>
      <Surface
        as="button"
        interactive
        onClick={() => setSheetOpen(true)}
        aria-label={`查看「${name}」详细介绍${owned ? '（已拥有）' : ''}`}
        className="flex w-full flex-col p-4 text-left"
      >
        {/* 徽章行 */}
        <div className="flex min-h-6 flex-wrap items-center gap-1.5">
          {duration && <Badge tone="blue">{duration}</Badge>}
          <VipBenefitBadges subscription={subscription} />
          {owned && <Badge tone="success">已拥有</Badge>}
        </div>

        {/* 订阅名称 */}
        <h2 className="mt-2 line-clamp-2 text-base font-semibold leading-snug text-apple-text">
          {name}
        </h2>

        {/* 价格（第一层级） */}
        <p className="mt-2 text-xl font-semibold leading-none tabular-nums text-apple-text">
          {formatPrice(price)}
        </p>

        <span className="mt-3 inline-flex items-center gap-px text-xs font-medium text-apple-blue">
          {owned ? '续费 / 查看详情' : '查看详情'} <span aria-hidden>›</span>
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

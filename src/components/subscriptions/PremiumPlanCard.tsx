'use client';

import { useState } from 'react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Message from '@/components/ui/Message';
import GlassSurface from '@/components/ui/GlassSurface';
import ExternalLinkAction from '@/components/ui/ExternalLinkAction';
import SubscriptionPurchaseSheet from './SubscriptionPurchaseSheet';
import { formatPrice } from '@/lib/format';
import type { Subscription } from '@/lib/types';

/**
 * 主套餐卡（Brief §13.4：订阅页是 conversion-oriented 重点页）。
 * 现有排序第一个订阅升格为 premium 玻璃主卡（用户拍板：不动业务数据）：
 * CCC 身份色（indigo→violet）渐变环境层 + 玻璃面板 + 完整价值主张 +
 * 大价格 + 全页最明确 CTA「立即订阅」。
 *
 * 图位预留（用户拍板：CSS 材质先行）：subscriptions 表现无封面字段；
 * 将来加字段后在玻璃面板顶部插 CoverImage 即可，材质层无需改动。
 *
 * 业务行为不变：CTA 打开 SubscriptionPurchaseSheet（收款码 + 推送订单闭环）。
 */
export default function PremiumPlanCard({ subscription }: { subscription: Subscription }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pushedOrder, setPushedOrder] = useState<string | null>(null);
  const { name, price, duration, description, link_url, type } = subscription;

  return (
    <section aria-label={`主推套餐：${name}`}>
      <GlassSurface tint="premium">
        <div className="p-6 sm:p-8">
          {/* 徽章行 */}
          <div className="flex flex-wrap items-center gap-2">
            {duration && <Badge tone="blue">{duration}</Badge>}
            {type === 'daily_plan' && <Badge tone="neutral">每日更新</Badge>}
          </div>

          {/* 套餐名 */}
          <h2 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-apple-text">
            {name}
          </h2>

          {/* 价值主张 */}
          {description && (
            <p className="mt-2.5 whitespace-pre-line text-base leading-relaxed text-apple-text-2">
              {description}
            </p>
          )}

          {/* 价格 */}
          <p className="mt-5 text-2xl font-semibold leading-none tracking-tight text-apple-text">
            {formatPrice(price)}
          </p>

          {/* CTA —— 全页视觉层级中最明确的交互元素 */}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-5"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
          >
            立即订阅
          </Button>

          {link_url && (
            <div className="mt-3.5 flex justify-center">
              <ExternalLinkAction href={link_url}>了解更多</ExternalLinkAction>
            </div>
          )}

          {/* 推送成功提示 */}
          {pushedOrder && (
            <Message tone="success" title="订阅已成功推送" className="mt-4">
              订单号 {pushedOrder}。我们确认收款后会自动解锁订阅，您可在「我的库」查看。
            </Message>
          )}
        </div>
      </GlassSurface>

      <SubscriptionPurchaseSheet
        subscription={subscription}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPushed={(orderNo) => {
          setSheetOpen(false);
          setPushedOrder(orderNo);
        }}
      />
    </section>
  );
}

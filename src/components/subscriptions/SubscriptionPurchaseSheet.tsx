'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import ActionSheet, { SheetItem } from '@/components/ui/ActionSheet';
import PaymentMethodBody from '@/components/checkout/PaymentMethodBody';
import CouponCodeInput, { type AppliedCoupon } from '@/components/checkout/CouponCodeInput';
import Badge from '@/components/ui/Badge';
import { formatPrice } from '@/lib/format';
import type { Subscription } from '@/lib/types';
import type { PaymentMethod } from '@/lib/order-types';

interface SubscriptionPurchaseSheetProps {
  subscription: Subscription;
  open: boolean;
  onClose: () => void;
  /** 订单推送成功（返回订单号）；父组件负责关弹层与展示成功提示 */
  onPushed: (orderNo: string) => void;
  loginFrom?: string;
}

/**
 * 订阅详情 + 下单弹层（SubscriptionCard / PremiumPlanCard 共用主体，
 * 自 SubscriptionCard 内联实现抽出——相同语义相同实现）。
 * 业务行为与原版完全一致：价格/时长/介绍展示 + PaymentMethodBody
 * （收款码 + 推送订单闭环）+「了解更多」外链，未登录跳 /login?from=。
 */
export default function SubscriptionPurchaseSheet({
  subscription,
  open,
  onClose,
  onPushed,
  loginFrom = '/subscription',
}: SubscriptionPurchaseSheetProps) {
  const { name, price, duration, description, link_url } = subscription;

  // 优惠券（需求 6：全场通用，含订阅）
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const orderItems = [
    { ref_type: 'subscription' as const, ref_id: subscription.id, quantity: 1 },
  ];
  const payable = coupon ? coupon.payable : price;

  const buildBody = (method: PaymentMethod) => ({
    items: orderItems,
    payment_method: method,
    ...(coupon ? { coupon_code: coupon.code } : {}),
  });

  return (
    <ActionSheet open={open} onClose={onClose} title={name}>
      {/* 价格 + 时长 */}
      <div className="flex items-center gap-2.5 px-6 pb-1">
        <p className="text-2xl font-semibold leading-none tracking-tight text-apple-text">
          {formatPrice(price)}
        </p>
        {duration && <Badge tone="blue">{duration}</Badge>}
      </div>

      {/* 详细介绍 */}
      {description ? (
        <p className="whitespace-pre-line px-6 pb-4 pt-3 text-sm leading-relaxed text-apple-text-2">
          {description}
        </p>
      ) : (
        <p className="px-6 pb-4 pt-3 text-sm text-apple-text-3">暂无详细介绍</p>
      )}

      <div className="border-t border-apple-hairline px-5 pb-3 pt-4">
        {/* 优惠码（全场通用）：试算通过后下单带上 coupon_code */}
        <div className="mb-3">
          <CouponCodeInput items={orderItems} applied={coupon} onChange={setCoupon} />
        </div>
        {coupon && (
          <div className="mb-3 space-y-1 rounded-card border border-apple-border bg-apple-bg px-3.5 py-3 text-sm">
            <div className="flex items-center justify-between text-apple-text-2">
              <span>订阅价</span>
              <span className="tabular-nums">{formatPrice(coupon.original_total)}</span>
            </div>
            <div className="flex items-center justify-between text-apple-success">
              <span>优惠</span>
              <span className="tabular-nums">-{formatPrice(coupon.discount_amount)}</span>
            </div>
            <div className="flex items-center justify-between font-semibold text-apple-text">
              <span>实付</span>
              <span className="tabular-nums">{formatPrice(coupon.payable)}</span>
            </div>
          </div>
        )}
        <PaymentMethodBody
          total={payable}
          buildBody={buildBody}
          onSuccess={onPushed}
          loginFrom={loginFrom}
        />
        {link_url && (
          <SheetItem
            icon={ExternalLink}
            title="了解更多"
            subtitle="在新标签页打开链接"
            href={link_url}
          />
        )}
      </div>
    </ActionSheet>
  );
}

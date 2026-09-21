'use client';

import { ExternalLink } from 'lucide-react';
import type { Activity } from '@/lib/types';
import type { CouponWithState } from '@/lib/coupon-types';
import ActionSheet, { SheetItem } from '@/components/ui/ActionSheet';
import CouponClaimList from '@/components/coupons/CouponClaimList';

/**
 * 活动详情弹层（UI 升级 §8.4）：完整介绍 + 优惠券领取 / 专属码 + 外链。
 * 从原 ActivityCard 原样拆出，主推卡与普通卡共用同一套弹层与业务行为：
 * 券的领取、专属码展示、跳转链接一律未改动，只调整了承载它的卡片视觉。
 */
export default function ActivityDetailSheet({
  activity,
  title,
  open,
  onClose,
  coupons,
  onClaimChange,
}: {
  activity: Activity;
  title: string | null;
  open: boolean;
  onClose: () => void;
  coupons: CouponWithState[];
  onClaimChange: (couponId: string, myClaim: CouponWithState['my_claim']) => void;
}) {
  const href = activity.link_url;

  return (
    <ActionSheet open={open} onClose={onClose} title={title ?? '活动详情'}>
      {activity.description && (
        <p className="whitespace-pre-line px-6 pb-4 text-sm leading-relaxed text-apple-text-2">
          {activity.description}
        </p>
      )}
      {/* 优惠券：领取 / 查看专属码（无券时不渲染） */}
      <CouponClaimList coupons={coupons} onChange={onClaimChange} />
      {href ? (
        <div className="border-t border-apple-hairline">
          <SheetItem
            icon={ExternalLink}
            title="了解更多"
            subtitle="在新标签页打开链接"
            href={href}
          />
        </div>
      ) : (
        !activity.description && (
          <p className="px-6 py-6 text-center text-sm text-apple-text-3">暂无活动详情</p>
        )
      )}
    </ActionSheet>
  );
}

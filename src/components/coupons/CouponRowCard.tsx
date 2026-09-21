'use client';

import { formatExpiry } from '@/lib/format';
import { daysUntilExpiry } from './coupon-row-adapter';
import { COUPON_TYPE, couponThresholdText, type CouponWithState } from '@/lib/coupon-types';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';

/** 券面额大字（满减显示「¥10」/ 折扣显示「9 折」口径直接给百分比） */
export function couponFaceText(coupon: Pick<CouponWithState, 'type' | 'value'>): string {
  const v = Number(coupon.value);
  return coupon.type === COUPON_TYPE.PERCENT ? `${v}%` : `¥${v.toFixed(v % 1 === 0 ? 0 : 2)}`;
}

/** 券的领取/使用状态 → 徽章文案与色调（UI Badge 的 token 档） */
export function claimStateBadge(
  myClaim: CouponWithState['my_claim'],
  expired: boolean,
): { text: string; tone: BadgeTone } | null {
  if (!myClaim) return null;
  if (myClaim.used_at) return { text: '已使用', tone: 'neutral' };
  if (myClaim.order_id) return { text: '订单占用中', tone: 'blue' };
  if (expired) return { text: '已过期', tone: 'danger' };
  return { text: '可使用', tone: 'success' };
}

/**
 * 券行卡（活动弹层与「我的优惠券」共用）：
 * 左侧面额 + 名称/门槛/有效期，右侧状态徽章与操作槽。
 */
export default function CouponRowCard({
  coupon,
  action,
  className,
}: {
  coupon: CouponWithState;
  /** 右侧操作槽（领取按钮 / 复制码等） */
  action?: React.ReactNode;
  className?: string;
}) {
  const expired = Boolean(coupon.valid_to && Date.now() > Date.parse(coupon.valid_to));
  const badge = claimStateBadge(coupon.my_claim, expired);
  // 被动到期提醒：3 天内到期且还可用时，有效期行标红并写明「N 天后过期」
  const daysLeft = daysUntilExpiry(coupon.valid_to);
  const expiringSoon =
    daysLeft !== null && daysLeft >= 0 && daysLeft <= 3 && !expired && !coupon.my_claim?.used_at;
  const soldOut = coupon.remaining !== null && coupon.remaining <= 0;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-card border border-apple-border bg-apple-card px-3.5 py-3',
        expired && 'opacity-70',
        className,
      )}
    >
      <span className="flex h-12 w-14 flex-none flex-col items-center justify-center rounded-input bg-apple-danger-soft">
        <span className="text-md font-bold leading-none tabular-nums text-apple-danger">
          {couponFaceText(coupon)}
        </span>
        <span className="mt-0.5 text-2xs text-apple-danger/80">
          {coupon.type === COUPON_TYPE.PERCENT ? '折扣' : '满减'}
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-apple-text">{coupon.name}</p>
        <p className="mt-0.5 text-xs text-apple-text-2">
          {couponThresholdText(coupon)}
          {coupon.remaining !== null && ` · 剩 ${coupon.remaining} 张`}
        </p>
        <p
          className={cn(
            'mt-0.5 text-2xs',
            expiringSoon ? 'font-medium text-apple-danger' : 'text-apple-text-3',
          )}
        >
          {coupon.valid_to ? `有效期至 ${formatExpiry(coupon.valid_to)}` : '长期有效'}
          {expiringSoon && (daysLeft === 0 ? ' · 今天到期' : ` · ${daysLeft} 天后过期`)}
          {expired && ' · 已过期'}
        </p>
      </div>

      <div className="flex flex-none flex-col items-end gap-1.5">
        {badge && <Badge tone={badge.tone}>{badge.text}</Badge>}
        {action}
        {!badge && soldOut && <Badge tone="neutral">已领完</Badge>}
      </div>
    </div>
  );
}

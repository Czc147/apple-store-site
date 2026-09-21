'use client';

import { Ticket } from 'lucide-react';
import type { Activity } from '@/lib/types';
import type { CouponWithState } from '@/lib/coupon-types';
import Surface from '@/components/ui/Surface';
import CoverImage from '@/components/ui/CoverImage';
import Badge from '@/components/ui/Badge';
import { couponFaceText } from '@/components/coupons/CouponRowCard';
import ActivityDetailSheet from './ActivityDetailSheet';
import { formatOnlineDate, useActivityDetail } from './useActivityDetail';

/**
 * 普通活动卡（UI 升级 §8.4）：白底图文两列，安静档 —— 不使用玻璃。
 * 左侧方图 + 右侧「状态标签 / 标题 / 简介 / 上线时间」，整卡可点开详情弹层。
 * 状态标签用极轻背景：只有真实存在「现在可领」的券时才出现（业务判定不变），
 * 无券时该行不渲染，靠上线时间承担轻状态语义 —— 不伪造活动状态。
 *
 * 时间同样取自 created_at（活动表没有起止时间字段，不新增后端字段）。
 */
export default function ActivityCard({
  activity,
  coupons = [],
}: {
  activity: Activity;
  /** 该活动下的券（服务端带入；领取后本地更新，无需刷新页面） */
  coupons?: CouponWithState[];
}) {
  const {
    title,
    sheetOpen,
    openSheet,
    closeSheet,
    claimable,
    localCoupons,
    handleClaimChange,
  } = useActivityDetail(activity, coupons);

  const createdOn = formatOnlineDate(activity.created_at);

  return (
    <>
      <Surface
        as="button"
        interactive
        radius="card-lg"
        onClick={openSheet}
        aria-label={`查看「${title ?? '活动'}」详情`}
        className="flex w-full items-start gap-3.5 p-3 text-left"
      >
        <div className="w-24 shrink-0 overflow-hidden rounded-card sm:w-28">
          <CoverImage
            src={activity.image_url}
            alt={title ?? '活动图片'}
            ratio="square"
            sizes="(min-width: 640px) 112px, 96px"
          />
        </div>

        <div className="min-w-0 flex-1">
          {claimable && (
            <span className="mb-1.5 block">
              <Badge tone="danger" size="sm">
                <Ticket className="h-3 w-3" aria-hidden />
                领券 {couponFaceText(claimable)}
              </Badge>
            </span>
          )}
          <h2 className="line-clamp-2 text-md font-semibold leading-snug text-apple-text">
            {title ?? '活动'}
          </h2>
          {activity.description && (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-apple-text-2">
              {activity.description}
            </p>
          )}
          {createdOn && (
            <p className="mt-1.5 text-2xs text-apple-text-3">{createdOn} 上线</p>
          )}
        </div>
      </Surface>

      <ActivityDetailSheet
        activity={activity}
        title={title}
        open={sheetOpen}
        onClose={closeSheet}
        coupons={localCoupons}
        onClaimChange={handleClaimChange}
      />
    </>
  );
}

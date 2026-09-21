'use client';

import { CalendarDays, Sparkles, Ticket } from 'lucide-react';
import type { Activity } from '@/lib/types';
import type { CouponWithState } from '@/lib/coupon-types';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import CoverImage from '@/components/ui/CoverImage';
import GlassSurface from '@/components/ui/GlassSurface';
import { couponFaceText } from '@/components/coupons/CouponRowCard';
import ActivityDetailSheet from './ActivityDetailSheet';
import { formatOnlineDate, useActivityDetail } from './useActivityDetail';

/**
 * 活动主推卡（UI 升级 §8.4）：全站唯一允许在活动页使用 Premium Glass 的位置。
 * 结构：封面（图像优先）→ 主推标记 + 领券状态 → 大标题 → 时间 → 简介 → 主 CTA。
 * 移动端上下布局（图在上），lg 起左右分栏（左图右文，与订阅主推大卡同构）。
 *
 * 数据降级（§1.4）：活动没有「起止时间 / 进行中」字段，因此时间一律用
 * created_at 的「上线日期」表达，不伪造活动状态；状态位留给真实存在的
 * 可领优惠券（无券时整枚徽标不渲染）。
 *
 * 业务行为与普通卡完全一致（同一份 useActivityDetail + ActivityDetailSheet）：
 * 点主 CTA 仍打开同一个详情弹层，券的领取与专属码逻辑一行未改。
 */
export default function ActivityFeatureCard({
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
      <section aria-label={`主推活动：${title ?? '活动'}`} className="animate-rise">
        <GlassSurface tint="prism" radius="premium">
          <div className="p-5 sm:p-7 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-9 lg:p-8">
            {/* ---------- 封面：图像优先 ---------- */}
            <div className="overflow-hidden rounded-hero">
              <CoverImage
                src={activity.image_url}
                alt={title ?? '活动图片'}
                ratio="photo"
                sizes="(min-width: 1024px) 600px, 100vw"
                priority
              />
            </div>

            {/* ---------- 信息层 ---------- */}
            <div className="mt-5 lg:mt-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="blue">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  本期主推
                </Badge>
                {/* 领券状态：真实可领时才出现（业务判定与普通卡同一份） */}
                {claimable && (
                  <Badge tone="danger" size="sm">
                    <Ticket className="h-3 w-3" aria-hidden />
                    领券 {couponFaceText(claimable)}
                  </Badge>
                )}
              </div>

              <h2 className="mt-3 text-2xl font-semibold leading-tight text-apple-text sm:text-editorial-title">
                {title ?? '活动详情'}
              </h2>

              {createdOn && (
                <p className="mt-2 flex items-center gap-1.5 text-2xs font-medium text-apple-text-2">
                  <CalendarDays className="h-3.5 w-3.5 flex-none" aria-hidden />
                  {createdOn} 上线
                </p>
              )}

              {activity.description && (
                <p className="mt-3 line-clamp-3 text-md leading-relaxed text-apple-text">
                  {activity.description}
                </p>
              )}

              <Button
                variant="primary"
                size="lg"
                fullWidth
                className="mt-5 sm:w-auto sm:px-9"
                onClick={openSheet}
                aria-haspopup="dialog"
              >
                查看活动详情
              </Button>
            </div>
          </div>
        </GlassSurface>
      </section>

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

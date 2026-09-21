'use client';

import { useState } from 'react';
import { ChevronRight, ExternalLink, Ticket } from 'lucide-react';
import type { Activity } from '@/lib/types';
import type { CouponWithState } from '@/lib/coupon-types';
import ActionSheet, { SheetItem } from '@/components/ui/ActionSheet';
import Surface from '@/components/ui/Surface';
import CoverImage from '@/components/ui/CoverImage';
import Badge from '@/components/ui/Badge';
import CouponClaimList from '@/components/coupons/CouponClaimList';
import { couponFaceText } from '@/components/coupons/CouponRowCard';

/** 旧数据无 title 时，回退到 description 首行作为卡片标题 */
function resolveTitle(activity: Activity): string | null {
  const t = activity.title?.trim();
  if (t) return t;
  const firstLine = activity.description?.split(/\r?\n/)[0]?.trim();
  return firstLine || null;
}

/**
 * 活动卡 = 全站统一 Featured Content Card（Brief §13.3，对标 Apple Store Today）：
 * - Surface 卡壳（20px 圆角 · hover 上浮 · active 微缩，手写 transition 清除）
 * - 4:3 封面（CoverImage：shimmer 骨架 + 失败回退 token 渐变，私有 hex 清除）
 * - 图底 scrim 渐变遮罩 + 白色粗体标题
 * - 图下介绍（2 行省略）+ 「了解更多 ›」
 * - 点击整卡打开弹层：完整介绍 + 优惠券领取 + 跳转链接
 * - 需求 6：带券的活动在封面右上角挂「领券」徽标（有可领的券时才显示）
 */
export default function ActivityCard({
  activity,
  coupons = [],
  onClaimed,
}: {
  activity: Activity;
  /** 该活动下的券（服务端带入；领取后本地更新，无需刷新页面） */
  coupons?: CouponWithState[];
  /** 领取成功回调（父组件用来刷新「我的优惠券」） */
  onClaimed?: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [localCoupons, setLocalCoupons] = useState<CouponWithState[]>(coupons);

  const title = resolveTitle(activity);
  const href = activity.link_url;

  // 封面徽标：取第一张「现在可领」的券展示面额
  const now = Date.now();
  const claimable = localCoupons.find(
    (c) =>
      c.enabled &&
      (!c.valid_from || now >= Date.parse(c.valid_from)) &&
      (!c.valid_to || now <= Date.parse(c.valid_to)) &&
      (c.remaining === null || c.remaining > 0) &&
      !c.my_claim,
  );

  const handleClaimChange = (couponId: string, myClaim: CouponWithState['my_claim']) => {
    setLocalCoupons((list) =>
      list.map((c) =>
        c.id === couponId
          ? {
              ...c,
              my_claim: myClaim,
              claimed_count: c.claimed_count + 1,
              remaining: c.remaining === null ? null : Math.max(0, c.remaining - 1),
            }
          : c,
      ),
    );
    onClaimed?.();
  };

  return (
    <>
      <Surface
        as="button"
        interactive
        onClick={() => setSheetOpen(true)}
        aria-label={`查看「${title ?? '活动'}」详情`}
        className="w-full overflow-hidden text-left"
      >
        {/* ---------- 大图区 ---------- */}
        <CoverImage
          src={activity.image_url}
          alt={title ?? '活动图片'}
          ratio="photo"
          sizes="(min-width: 640px) 45vw, 100vw"
          overlay={
            title || claimable ? (
              <>
                {title && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-apple-scrim-image via-apple-scrim/60 to-transparent px-3.5 pb-3 pt-10">
                    <h2 className="line-clamp-2 text-md font-bold leading-snug tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]">
                      {title}
                    </h2>
                  </div>
                )}
                {/* 领券徽标（可领时才出现；on-image 是唯一允许压在封面上的材质） */}
                {claimable && (
                  <span className="pointer-events-none absolute right-2.5 top-2.5">
                    <Badge tone="danger" size="sm">
                      <Ticket className="h-3 w-3" aria-hidden />
                      领券 {couponFaceText(claimable)}
                    </Badge>
                  </span>
                )}
              </>
            ) : undefined
          }
        />

        {/* ---------- 文字区 ---------- */}
        <div className="px-3.5 pb-4 pt-3">
          {activity.description && (
            <p className="line-clamp-2 text-xs leading-relaxed text-apple-text-2">
              {activity.description}
            </p>
          )}
          {href && (
            <span className="mt-2 inline-flex items-center gap-px text-xs font-medium text-apple-blue">
              了解更多
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
            </span>
          )}
        </div>
      </Surface>

      <ActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={title ?? '活动详情'}
      >
        {activity.description && (
          <p className="whitespace-pre-line px-6 pb-4 text-sm leading-relaxed text-apple-text-2">
            {activity.description}
          </p>
        )}
        {/* 优惠券：领取 / 查看专属码（无券时不渲染） */}
        <CouponClaimList coupons={localCoupons} onChange={handleClaimChange} />
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
            <p className="px-6 py-6 text-center text-sm text-apple-text-3">
              暂无活动详情
            </p>
          )
        )}
      </ActionSheet>
    </>
  );
}

'use client';

import { useState } from 'react';
import type { Activity } from '@/lib/types';
import type { CouponWithState } from '@/lib/coupon-types';

/** 旧数据无 title 时，回退到 description 首行作为卡片标题 */
export function resolveActivityTitle(activity: Activity): string | null {
  const t = activity.title?.trim();
  if (t) return t;
  const firstLine = activity.description?.split(/\r?\n/)[0]?.trim();
  return firstLine || null;
}

/**
 * 上线日期 `YYYY-MM-DD`（固定北京时区，与 lib/daily.ts 的 todayDateCN 同一口径）。
 * 活动卡是服务端渲染 + 客户端注水的组件，用固定时区可避免服务器（多为 UTC）
 * 与用户浏览器跨零点时渲染出不同日期，导致 hydration 不一致。
 * 活动表没有起止时间字段（§1.4 不加后端字段），卡片上的「时间」一律用它表达。
 */
const CN_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatOnlineDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : CN_DATE.format(d);
}

/**
 * 活动卡共用的「详情弹层 + 领券」状态（UI 升级 §8.4）：
 * 主推卡（玻璃）与普通卡（安静白卡）各有一套视觉，但共用这一份逻辑——
 * 标题回退、现在可领的券判定（时间窗 / 余量 / 每人限领）、
 * 领取成功后本地券列表更新（无需刷新页面）。
 * 纯展示层状态，接口调用与业务规则均保持不变。
 */
export function useActivityDetail(activity: Activity, coupons: CouponWithState[]) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [localCoupons, setLocalCoupons] = useState<CouponWithState[]>(coupons);

  const title = resolveActivityTitle(activity);

  // 封面/卡面徽标：取第一张「现在可领」的券展示面额
  const now = Date.now();
  const claimable = localCoupons.find(
    (c) =>
      c.enabled &&
      (!c.valid_from || now >= Date.parse(c.valid_from)) &&
      (!c.valid_to || now <= Date.parse(c.valid_to)) &&
      (c.remaining === null || c.remaining > 0) &&
      c.my_claim_count < c.per_user_limit,
  );

  const handleClaimChange = (couponId: string, myClaim: CouponWithState['my_claim']) => {
    setLocalCoupons((list) =>
      list.map((c) =>
        c.id === couponId
          ? {
              ...c,
              my_claim: myClaim,
              my_claim_count: c.my_claim_count + 1,
              claimed_count: c.claimed_count + 1,
              remaining: c.remaining === null ? null : Math.max(0, c.remaining - 1),
            }
          : c,
      ),
    );
  };

  return {
    title,
    href: activity.link_url,
    sheetOpen,
    openSheet: () => setSheetOpen(true),
    closeSheet: () => setSheetOpen(false),
    claimable,
    localCoupons,
    handleClaimChange,
  };
}

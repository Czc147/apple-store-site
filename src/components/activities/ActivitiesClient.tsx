'use client';

import { CalendarDays } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import Message from '@/components/ui/Message';
import SectionHeader from '@/components/ui/SectionHeader';
import type { CouponWithState } from '@/lib/coupon-types';
import type { Activity } from '@/lib/types';
import ActivityCard from './ActivityCard';
import ActivityFeatureCard from './ActivityFeatureCard';

interface ActivitiesClientProps {
  activities: Activity[];
  isDemo: boolean;
  /** 各活动下的优惠券（服务端带上，含余量；我的领取状态在卡片弹层内另拉） */
  couponsByActivity: Record<string, CouponWithState[]>;
}

/**
 * 活动页主体（UI 升级 §8.4）：像「活动专题」而不是公告列表。
 * 结构 = 页面标题（page.tsx）→ 主推卡（首个活动 · Premium Glass · 大标题 + 封面 + 主 CTA）
 * → 其余活动（安静白底图文卡 + 极轻状态标签）。
 *
 * 板块顺序与数据来源完全不变：仍是 ActivitiesServer 按 sort_order 取数后原样渲染，
 * 前端只把第一个活动提为主推（不重排、不筛选）。
 * 券的业务逻辑（徽标 + 弹层领取）在两张卡内共用同一份实现。
 */
export default function ActivitiesClient({
  activities,
  isDemo,
  couponsByActivity,
}: ActivitiesClientProps) {
  if (activities.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="暂无活动"
        description="精彩活动与限时优惠会第一时间发布在这里，常回来看看。"
      />
    );
  }

  // 第一个活动即主推（后台排布顺序不变，前端不重排）
  const [featured, ...rest] = activities;

  return (
    <div>
      <div className="px-page">
        <div className="mx-auto max-w-wide">
          {isDemo && (
            <Message tone="info" className="mb-5">
              当前为演示数据 · 配置 SUPABASE 环境变量后将自动显示真实活动
            </Message>
          )}

          <ActivityFeatureCard
            activity={featured}
            coupons={couponsByActivity[featured.id] ?? []}
          />
        </div>
      </div>

      {rest.length > 0 && (
        <section className="mt-8 sm:mt-10">
          <div className="mx-auto max-w-wide px-page">
            <SectionHeader title="更多活动" count={rest.length} unit="个活动" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              {rest.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  coupons={couponsByActivity[activity.id] ?? []}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

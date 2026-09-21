'use client';

import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import Message from '@/components/ui/Message';
import MyCoupons from '@/components/coupons/MyCoupons';
import type { CouponWithState } from '@/lib/coupon-types';
import type { Activity } from '@/lib/types';
import ActivityCard from './ActivityCard';

interface ActivitiesClientProps {
  activities: Activity[];
  isDemo: boolean;
  /** 各活动下的优惠券（服务端带上，含余量；我的领取状态在卡片弹层内另拉） */
  couponsByActivity: Record<string, CouponWithState[]>;
}

/**
 * 活动页主体（Brief §13.3：Intentional Empty State + 统一 Featured Content Card，
 * 不另建 Banner 体系）。
 * audit 收敛：移动端两列每卡仅 ~140px 过挤 → 单列 editorial 大卡流，
 * sm 起两列；演示提示条 → Message。
 * 需求 6：活动卡带券徽标 + 弹层内领取；页尾「我的优惠券」（登录后）。
 */
export default function ActivitiesClient({
  activities,
  isDemo,
  couponsByActivity,
}: ActivitiesClientProps) {
  // 领券成功后自增，触发「我的优惠券」重新拉取
  const [couponVersion, setCouponVersion] = useState(0);

  if (activities.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="暂无活动"
        description="精彩活动与限时优惠会第一时间发布在这里，常回来看看。"
      />
    );
  }

  return (
    <div className="px-page">
      {isDemo && (
        <Message tone="info" className="mb-4">
          当前为演示数据 · 配置 SUPABASE 环境变量后将自动显示真实活动
        </Message>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {activities.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            coupons={couponsByActivity[activity.id] ?? []}
            onClaimed={() => setCouponVersion((v) => v + 1)}
          />
        ))}
      </div>

      <MyCoupons refreshKey={couponVersion} />
    </div>
  );
}

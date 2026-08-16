'use client';

import { CalendarDays } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import type { Activity } from '@/lib/types';
import ActivityCard from './ActivityCard';

interface ActivitiesClientProps {
  activities: Activity[];
  isDemo: boolean;
}

/** 活动页主体：大卡片纵向列表（含演示数据提示条与空态） */
export default function ActivitiesClient({
  activities,
  isDemo,
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

  return (
    <div className="space-y-6 px-5">
      {isDemo && (
        <div className="rounded-card bg-apple-blue-soft px-4 py-3 text-[12.5px] leading-relaxed text-apple-blue">
          当前为演示数据 · 配置 SUPABASE 环境变量后将自动显示真实活动
        </div>
      )}
      {activities.map((activity) => (
        <ActivityCard key={activity.id} activity={activity} />
      ))}
    </div>
  );
}

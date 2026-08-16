'use client';

import { CreditCard } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import type { Subscription } from '@/lib/types';
import SubscriptionCard from './SubscriptionCard';

interface SubscriptionsClientProps {
  subscriptions: Subscription[];
  isDemo: boolean;
}

/**
 * 订阅页主体：Apple 式套餐对比卡片布局。
 * 移动端单列；宽屏自动升级为 2/3 列网格，按钮底部对齐。
 */
export default function SubscriptionsClient({
  subscriptions,
  isDemo,
}: SubscriptionsClientProps) {
  if (subscriptions.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="暂无订阅方案"
        description="订阅方案上线后会第一时间展示在这里，敬请期待。"
      />
    );
  }

  return (
    <div className="px-5">
      {isDemo && (
        <div className="mb-5 rounded-card bg-apple-blue-soft px-4 py-3 text-[12.5px] leading-relaxed text-apple-blue">
          当前为演示数据 · 配置 SUPABASE 环境变量后将自动显示真实订阅方案
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subscriptions.map((subscription) => (
          <SubscriptionCard key={subscription.id} subscription={subscription} />
        ))}
      </div>
    </div>
  );
}

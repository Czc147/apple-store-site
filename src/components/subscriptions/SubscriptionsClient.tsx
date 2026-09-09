'use client';

import { CreditCard } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import Message from '@/components/ui/Message';
import SectionHeader from '@/components/ui/SectionHeader';
import type { Subscription } from '@/lib/types';
import PremiumPlanCard from './PremiumPlanCard';
import SubscriptionCard from './SubscriptionCard';

interface SubscriptionsClientProps {
  subscriptions: Subscription[];
  isDemo: boolean;
}

/**
 * 订阅页主体（Brief §13.4 转化结构）：
 * 主套餐（现有排序第一个 = premium 玻璃主卡，用户拍板不动业务数据）
 * → 更多套餐（常规两列网格）。
 * 只有一个订阅时只显示主卡；空列表显示 Intentional Empty State。
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

  const [primary, ...rest] = subscriptions;

  return (
    <div className="px-page">
      {isDemo && (
        <Message tone="info" className="mb-5">
          当前为演示数据 · 配置 SUPABASE 环境变量后将自动显示真实订阅方案
        </Message>
      )}

      <PremiumPlanCard subscription={primary} />

      {rest.length > 0 && (
        <section className="mt-8">
          <SectionHeader title="更多套餐" count={rest.length} />
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {rest.map((subscription) => (
              <SubscriptionCard key={subscription.id} subscription={subscription} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

import { Suspense } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import SubscriptionsServer from '@/components/subscriptions/SubscriptionsServer';
import SubscriptionsSkeleton from '@/components/subscriptions/SubscriptionsSkeleton';

export const metadata = {
  title: '订阅',
  description: '灵活的订阅套餐：月付、季付、年付随心选择，轻点按钮即可开通。',
};

// 订阅数据实时读取，禁止构建时静态化
export const dynamic = 'force-dynamic';

/** Tab 4 · 订阅：主套餐 premium 玻璃卡 + 更多套餐网格，点「立即订阅」直达支付 */
export default function SubscriptionPage() {
  return (
    <>
      {/* 标题下的小字副标题按需求去掉（2026-10-04） */}
      <PageHeader title="订阅" />

      <Suspense fallback={<SubscriptionsSkeleton />}>
        <SubscriptionsServer />
      </Suspense>
    </>
  );
}

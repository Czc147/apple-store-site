import { Suspense } from 'react';
import SubscriptionsServer from '@/components/subscriptions/SubscriptionsServer';
import SubscriptionsSkeleton from '@/components/subscriptions/SubscriptionsSkeleton';

export const metadata = {
  title: '订阅',
  description: '灵活的订阅套餐：月付、季付、年付随心选择，轻点按钮即可开通。',
};

// 订阅数据实时读取，禁止构建时静态化
export const dynamic = 'force-dynamic';

/** Tab 4 · 订阅：Apple 式套餐对比卡片，点按钮直达支付 */
export default function SubscriptionPage() {
  return (
    <>
      <header className="px-5 pb-6 pt-14">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-apple-text">
          订阅
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-apple-text-2">
          灵活套餐随心选，轻点「立即订阅」即可开通
        </p>
      </header>

      <Suspense fallback={<SubscriptionsSkeleton />}>
        <SubscriptionsServer />
      </Suspense>
    </>
  );
}

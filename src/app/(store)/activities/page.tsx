import { Suspense } from 'react';
import ActivitiesServer from '@/components/activities/ActivitiesServer';
import ActivitiesSkeleton from '@/components/activities/ActivitiesSkeleton';

export const metadata = {
  title: '活动',
  description: '限时活动与精彩企划第一时间发布，轻点卡片了解详情与参与方式。',
};

// 活动数据实时读取，禁止构建时静态化
export const dynamic = 'force-dynamic';

/** Tab 3 · 活动：Apple Store Today 式大卡片流 */
export default function ActivitiesPage() {
  return (
    <>
      <header className="px-5 pb-6 pt-14">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-apple-text">
          活动
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-apple-text-2">
          限时活动与精彩企划，轻点卡片了解更多
        </p>
      </header>

      <Suspense fallback={<ActivitiesSkeleton />}>
        <ActivitiesServer />
      </Suspense>
    </>
  );
}

import { Suspense } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import ActivitiesServer from '@/components/activities/ActivitiesServer';
import ActivitiesSkeleton from '@/components/activities/ActivitiesSkeleton';

export const metadata = {
  title: '活动',
  description: '限时活动与精彩企划第一时间发布，轻点卡片了解详情与参与方式。',
};

// 活动数据实时读取，禁止构建时静态化
export const dynamic = 'force-dynamic';

/** Tab 3 · 活动：Apple Store Today 式 editorial 大卡片流 */
export default function ActivitiesPage() {
  return (
    <>
      <PageHeader title="活动" subtitle="限时活动与精彩企划，轻点卡片了解更多" />

      <Suspense fallback={<ActivitiesSkeleton />}>
        <ActivitiesServer />
      </Suspense>
    </>
  );
}

import ActivitiesManager from '@/components/admin/ActivitiesManager';

export const metadata = { title: '活动管理' };

export const dynamic = 'force-dynamic';

/** 后台 · 活动管理 */
export default function AdminActivitiesPage() {
  return <ActivitiesManager />;
}

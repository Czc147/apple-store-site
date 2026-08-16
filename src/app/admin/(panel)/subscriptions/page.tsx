import SubscriptionsManager from '@/components/admin/SubscriptionsManager';

export const metadata = { title: '订阅管理' };

export const dynamic = 'force-dynamic';

/** 后台 · 订阅管理 */
export default function AdminSubscriptionsPage() {
  return <SubscriptionsManager />;
}

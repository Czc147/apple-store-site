import CardDeliveriesManager from '@/components/admin/card/CardDeliveriesManager';

export const metadata = { title: '发货记录' };

export const dynamic = 'force-dynamic';

/** 后台 · 发货记录（取卡登记） */
export default function AdminCardDeliveriesPage() {
  return <CardDeliveriesManager />;
}

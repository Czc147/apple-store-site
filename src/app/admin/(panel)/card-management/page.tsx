import CardOverview from '@/components/admin/card/CardOverview';

export const metadata = { title: '发卡概览' };

export const dynamic = 'force-dynamic';

/** 后台 · 发卡概览（库存与发放统计） */
export default function AdminCardManagementPage() {
  return <CardOverview />;
}

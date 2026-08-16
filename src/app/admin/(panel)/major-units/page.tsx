import MajorUnitsManager from '@/components/admin/MajorUnitsManager';

export const metadata = { title: '大单元管理' };

export const dynamic = 'force-dynamic';

/** 后台 · 大单元管理 */
export default function AdminMajorUnitsPage() {
  return <MajorUnitsManager />;
}

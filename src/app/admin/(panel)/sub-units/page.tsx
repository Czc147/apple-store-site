import SubUnitsManager from '@/components/admin/SubUnitsManager';

export const metadata = { title: '小单元管理' };

export const dynamic = 'force-dynamic';

/** 后台 · 小单元管理 */
export default function AdminSubUnitsPage() {
  return <SubUnitsManager />;
}

import EntitlementsManager from '@/components/admin/EntitlementsManager';

export const metadata = { title: '用户权益' };

export const dynamic = 'force-dynamic';

/** 后台 · 用户权益管理（我的库数据源：延长有效期 / 撤销并作废关联卡密） */
export default function AdminLibraryPage() {
  return <EntitlementsManager />;
}

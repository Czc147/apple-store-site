import CardKeysManager from '@/components/admin/card/CardKeysManager';

export const metadata = { title: '卡密库存' };

export const dynamic = 'force-dynamic';

/** 后台 · 卡密库存管理 */
export default function AdminCardKeysPage() {
  return <CardKeysManager />;
}

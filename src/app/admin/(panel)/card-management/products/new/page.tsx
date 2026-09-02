import CardProductForm from '@/components/admin/card/CardProductForm';

export const metadata = { title: '新建卡密商品' };

export const dynamic = 'force-dynamic';

/** 后台 · 新建卡密商品 */
export default function AdminCardProductNewPage() {
  return <CardProductForm mode="create" />;
}

import CardProductsManager from '@/components/admin/card/CardProductsManager';

export const metadata = { title: '卡密商品' };

export const dynamic = 'force-dynamic';

/** 后台 · 卡密商品列表 */
export default function AdminCardProductsPage() {
  return <CardProductsManager />;
}

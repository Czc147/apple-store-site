import CardProductForm from '@/components/admin/card/CardProductForm';

export const metadata = { title: '编辑卡密商品' };

export const dynamic = 'force-dynamic';

/** 后台 · 编辑卡密商品 */
export default function AdminCardProductEditPage({
  params,
}: {
  params: { id: string };
}) {
  return <CardProductForm mode="edit" id={params.id} />;
}

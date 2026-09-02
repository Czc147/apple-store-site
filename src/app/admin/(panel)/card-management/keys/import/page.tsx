import CardKeyImport from '@/components/admin/card/CardKeyImport';

export const metadata = { title: '批量导入卡密' };

export const dynamic = 'force-dynamic';

/** 后台 · 批量导入卡密 */
export default function AdminCardKeyImportPage() {
  return <CardKeyImport />;
}

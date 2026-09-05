import BulkImport from '@/components/admin/BulkImport';

export const metadata = { title: '文件夹批量导入' };

export const dynamic = 'force-dynamic';

/** 后台 · 文件夹批量导入（拖文件夹 / zip 自动识别小单元、兑换内容与卡密） */
export default function AdminBulkImportPage() {
  return <BulkImport />;
}

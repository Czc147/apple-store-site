import CardKeyGenerate from '@/components/admin/card/CardKeyGenerate';

export const metadata = { title: '生成卡密' };

export const dynamic = 'force-dynamic';

/** 后台 · 一键生成卡密 */
export default function AdminCardKeyGeneratePage() {
  return <CardKeyGenerate />;
}

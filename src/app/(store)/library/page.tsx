import LibraryClient from '@/components/library/LibraryClient';
import PageHeader from '@/components/ui/PageHeader';

export const metadata = {
  title: '我的库',
  description: '查看你解锁的每日计划与兑换内容，登录账号后换设备也能找回。',
};

// 依赖登录态与实时权益，禁止构建时静态化
export const dynamic = 'force-dynamic';

/**
 * Tab 6 · 我的库：游客看本机记录 + 注册引导；登录看权威权益 + 一键同步。
 * audit 收敛：手抄页头 → PageHeader；页面级 Suspense 骨架删除
 * （LibraryClient 是纯客户端组件不会 suspend，双层骨架形状还不同——
 * 客户端自带同构 loading 骨架）。
 */
export default function LibraryPage() {
  return (
    <>
      <PageHeader title="我的库" subtitle="你解锁的每日计划与兑换内容都在这里" />
      <LibraryClient />
    </>
  );
}

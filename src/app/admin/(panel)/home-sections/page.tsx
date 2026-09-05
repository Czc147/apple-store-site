import HomeSectionsManager from '@/components/admin/HomeSectionsManager';

export const metadata = { title: '首页板块' };

export const dynamic = 'force-dynamic';

/** 后台 · 首页板块管理（标题 + 卡片流；carousel/grid） */
export default function AdminHomeSectionsPage() {
  return <HomeSectionsManager />;
}

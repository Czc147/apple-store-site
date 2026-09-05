import DailyPicksManager from '@/components/admin/DailyPicksManager';

export const metadata = { title: '每日推荐' };

export const dynamic = 'force-dynamic';

/** 后台 · 每日推荐内容管理（一天一条：封面公开 / 内容私有桶 / 可选跳转链接） */
export default function AdminDailyPicksPage() {
  return <DailyPicksManager />;
}

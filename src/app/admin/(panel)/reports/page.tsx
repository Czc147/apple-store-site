import ReportsManager from '@/components/admin/ReportsManager';

export const metadata = {
  title: '举报管理',
};

/** 举报管理：用户对帖子的举报，标记处理状态（删帖仍在帖子管理里做） */
export default function ReportsAdminPage() {
  return <ReportsManager />;
}

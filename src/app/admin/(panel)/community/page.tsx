import CommunityManager from '@/components/admin/CommunityManager';

export const metadata = {
  title: '社区管理',
};

/** 社区管理：置顶通知 + 帖子管理 */
export default function CommunityAdminPage() {
  return <CommunityManager />;
}

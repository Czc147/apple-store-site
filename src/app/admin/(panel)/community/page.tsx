import CommunityManager from '@/components/admin/CommunityManager';

export const metadata = {
  title: '探究管理',
};

/** 探究管理（原「社区管理」，2026-09-22 随前台改名；路由保留 /admin/community）：置顶通知 + 帖子管理 */
export default function CommunityAdminPage() {
  return <CommunityManager />;
}

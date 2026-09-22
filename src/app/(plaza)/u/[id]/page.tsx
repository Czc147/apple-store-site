import UserProfilePage from '@/components/plaza/UserProfilePage';

export const metadata = {
  title: '个人主页',
};

export const dynamic = 'force-dynamic';

/**
 * 个人主页（用户需求 #5 / #6）：点任何头像进来，看他的作品与拼单。
 * 放在 (plaza) 路由组下 —— 两个入口（交流板块的作者头像、对话板块的「我的主页」）
 * 都在广场里，用同一套布局（无主 TabBar）才不会跳出去。
 */
export default function UserPage({ params }: { params: { id: string } }) {
  return <UserProfilePage userId={params.id} />;
}

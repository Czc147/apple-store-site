import MessagesManager from '@/components/admin/MessagesManager';

export const metadata = {
  title: '留言管理',
};

/**
 * 留言管理：用户给官方（哨兵账号）的留言，按用户聚合 + 以官方身份回复。
 * 站内唯一的「人工客服」入口 —— 在此之前用户留言只有机器人自动回复，站长看不到也回不了。
 */
export default function MessagesAdminPage() {
  return <MessagesManager />;
}

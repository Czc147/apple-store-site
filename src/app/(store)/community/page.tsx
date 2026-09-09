import CommunityClient from '@/components/community/CommunityClient';
import PageHeader from '@/components/ui/PageHeader';

export const metadata = {
  title: '社区',
  description: '告诉大家你最近在追什么、还有什么心得，和同好一起交流。',
};

export const dynamic = 'force-dynamic';

/**
 * Tab 5 · 社区：管理员置顶通知 + 用户纯文本帖（点赞/评论，7 天懒清理）。
 * audit 收敛：手抄页头 → PageHeader；双层骨架（page 一份 + client 一份）→
 * 只留 client 侧一份（CommunityClient 是纯客户端组件，Suspense 在此无意义）。
 */
export default function CommunityPage() {
  return (
    <>
      <PageHeader title="社区" subtitle="与同好交流，分享你的作品与心得" />

      <div className="px-page">
        <CommunityClient />
      </div>
    </>
  );
}

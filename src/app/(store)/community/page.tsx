import { Suspense } from 'react';
import CommunityClient from '@/components/community/CommunityClient';

export const metadata = {
  title: '社区',
  description: '告诉大家你最近在追什么、还有什么心得，和同好一起交流。',
};

export const dynamic = 'force-dynamic';

/** 社区骨架 */
function CommunitySkeleton() {
  return (
    <div className="px-4 sm:px-5">
      <div className="skeleton mb-3 h-20 rounded-card" />
      <div className="skeleton h-24 rounded-card" />
    </div>
  );
}

/** Tab 5 · 社区：管理员置顶通知 + 用户纯文本帖（点赞/评论，7 天懒清理） */
export default function CommunityPage() {
  return (
    <>
      <header className="px-5 pb-6 pt-14">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-apple-text">
          社区
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-apple-text-2">
          与同好交流，分享你的作品与心得
        </p>
      </header>

      <div className="px-4 sm:px-5">
        <Suspense fallback={<CommunitySkeleton />}>
          <CommunityClient />
        </Suspense>
      </div>
    </>
  );
}

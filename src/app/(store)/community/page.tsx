import Link from 'next/link';
import { Store } from 'lucide-react';
import NoticeList from '@/components/community/NoticeList';
import PageHeader from '@/components/ui/PageHeader';

export const metadata = {
  title: '探究',
  description: '告诉大家你最近在追什么、还有什么心得，和同好一起交流。',
};

export const dynamic = 'force-dynamic';

/**
 * Tab 5 · 探究（原「社区」，2026-09-22 用户改名；路由保留 /community）。
 *
 * 本页**只剩官方公告**：用户 2026-09-22 拍板「帖子流整个搬到广场」，
 * 发帖/点赞/评论/配图全在广场的「交流」板块（/community/plaza）。
 * 这页再长出一个信息流的话，用户会在两个地方看到两份帖子。
 *
 * 右上角是「探究广场」入口 —— 广场是另一个界面，有自己的底部板块栏
 * （所以单开了 (plaza) 路由组），刻意**不**做成本页的一个板块。
 */
export default function CommunityPage() {
  return (
    <>
      <PageHeader
        title="探究"
        subtitle="与同好交流，分享你的作品与心得"
        actions={
          <Link
            href="/community/plaza"
            className="inline-flex items-center gap-1.5 rounded-btn border border-apple-border bg-apple-card px-3.5 py-2 text-sm font-medium text-apple-text shadow-card pressable hover:bg-apple-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
          >
            <Store className="h-4 w-4 text-apple-blue" aria-hidden />
            探究广场
          </Link>
        }
      />

      <div className="px-page">
        <NoticeList />
      </div>
    </>
  );
}

import { Suspense } from 'react';
import DailyServer from '@/components/daily/DailyServer';

export const metadata = {
  title: '每日推荐',
  description:
    '每日计划更新内容：今天更新 1 期精选内容，解锁后可查看全部历史仓库。',
};

// 实时取数，禁止静态化（后台更新后前台立即可见）
export const dynamic = 'force-dynamic';

/** 每日推荐页骨架：今日卡 + 历史仓库列表 */
function DailySkeleton() {
  return (
    <div className="px-4 sm:px-5">
      <div className="overflow-hidden rounded-card-lg border border-apple-border bg-apple-card shadow-card">
        <div className="skeleton aspect-[16/9]" />
        <div className="space-y-2 p-4 sm:p-5">
          <div className="skeleton h-4 w-1/3 rounded-md" />
          <div className="skeleton h-5 w-2/3 rounded-md" />
          <div className="skeleton h-10 w-full rounded-btn" />
        </div>
      </div>
      <div className="mt-6 space-y-3">
        <div className="skeleton h-16 rounded-card" />
        <div className="skeleton h-16 rounded-card" />
        <div className="skeleton h-16 rounded-card" />
      </div>
    </div>
  );
}

/** 每日推荐：今日更新 + 历史仓库（解锁前只见标题的 teaser） */
export default function DailyPage() {
  return (
    <>
      <header className="px-5 pb-6 pt-14">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-apple-text">
          每日推荐
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-apple-text-2">
          每天更新 1 期精选内容，解锁后可查看全部历史仓库
        </p>
      </header>

      <Suspense fallback={<DailySkeleton />}>
        <DailyServer />
      </Suspense>
    </>
  );
}

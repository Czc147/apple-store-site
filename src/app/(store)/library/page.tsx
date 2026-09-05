import { Suspense } from 'react';
import LibraryClient from '@/components/library/LibraryClient';

export const metadata = {
  title: '我的库',
  description: '查看你解锁的每日计划与兑换内容，登录账号后换设备也能找回。',
};

// 依赖登录态与实时权益，禁止构建时静态化
export const dynamic = 'force-dynamic';

/** 我的库骨架 */
function LibrarySkeleton() {
  return (
    <div className="px-4 sm:px-5">
      <div className="skeleton mb-5 h-16 rounded-card-lg" />
      <div className="skeleton mb-4 h-28 rounded-card-lg" />
      <div className="skeleton h-20 rounded-card" />
    </div>
  );
}

/** Tab 6 · 我的库：游客看本机记录 + 注册引导；登录看权威权益 + 一键同步 */
export default function LibraryPage() {
  return (
    <>
      <header className="px-5 pb-6 pt-14">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-apple-text">
          我的库
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-apple-text-2">
          你解锁的每日计划与兑换内容都在这里
        </p>
      </header>

      <Suspense fallback={<LibrarySkeleton />}>
        <LibraryClient />
      </Suspense>
    </>
  );
}

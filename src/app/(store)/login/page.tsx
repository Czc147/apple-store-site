import { Suspense } from 'react';
import AuthClient from '@/components/auth/AuthClient';

export const metadata = {
  title: '登录',
  description: '注册或登录账号，把你的每日计划与兑换内容同步到「我的库」。',
};

// 登录涉及会话读写，禁止构建时静态化
export const dynamic = 'force-dynamic';

/** 登录页骨架（AuthClient 内部含 useSearchParams，需 Suspense 包裹） */
function AuthSkeleton() {
  return (
    <div className="mx-auto max-w-md px-5">
      <div className="rounded-card border border-apple-border bg-apple-card p-6 shadow-card">
        <div className="skeleton mb-5 h-10 w-10 rounded-full" />
        <div className="space-y-3">
          <div className="skeleton h-11 w-full rounded-xl" />
          <div className="skeleton h-11 w-full rounded-xl" />
          <div className="skeleton h-11 w-full rounded-btn" />
        </div>
      </div>
    </div>
  );
}

/** 登录 / 注册 / 找回密码 */
export default function LoginPage() {
  return (
    <>
      <header className="px-5 pb-6 pt-14">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-apple-text">
          账号
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-apple-text-2">
          登录后即可在「我的库」永久保存兑换内容与每日计划
        </p>
      </header>

      <Suspense fallback={<AuthSkeleton />}>
        <AuthClient />
      </Suspense>
    </>
  );
}

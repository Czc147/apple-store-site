import { Suspense } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import AuthClient from '@/components/auth/AuthClient';

export const metadata = {
  title: '登录',
  description: '注册或登录账号，把你的每日计划与兑换内容同步到「我的库」。',
};

// 登录涉及会话读写，禁止构建时静态化
export const dynamic = 'force-dynamic';

/** 登录页骨架（AuthClient 内部含 useSearchParams，需 Suspense 包裹）
    形状与最终表单同构（§9.5）：居中表单头 + 两输入 + 胶囊提交钮 */
function AuthSkeleton() {
  return (
    <div className="mx-auto w-full max-w-md px-page">
      <div className="rounded-card-lg border border-apple-border bg-apple-card p-6 shadow-card sm:p-8">
        <div className="mb-6 flex flex-col items-center">
          <div className="skeleton h-14 w-14 rounded-full" />
          <div className="skeleton mt-3.5 h-5 w-24 rounded-chip" />
          <div className="skeleton mt-2 h-3.5 w-32 rounded-chip" />
        </div>
        <div className="space-y-3.5">
          <div className="skeleton h-11 w-full rounded-input" />
          <div className="skeleton h-11 w-full rounded-input" />
          <div className="skeleton mt-1.5 h-11 w-full rounded-btn" />
        </div>
      </div>
    </div>
  );
}

/** 登录 / 注册 / 找回密码 */
export default function LoginPage() {
  return (
    <>
      <PageHeader
        title="账号"
        subtitle="登录后即可在「我的库」永久保存兑换内容与每日计划"
      />

      <Suspense fallback={<AuthSkeleton />}>
        <AuthClient />
      </Suspense>
    </>
  );
}

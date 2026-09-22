import { Suspense } from 'react';
import AuthClient from '@/components/auth/AuthClient';

export const metadata = {
  title: '登录',
  description: '注册或登录账号，把你的每日计划与兑换内容同步到「我的库」。',
};

// 登录涉及会话读写，禁止构建时静态化
export const dynamic = 'force-dynamic';

/**
 * 登录页骨架（AuthClient 内部含 useSearchParams，需 Suspense 包裹）。
 * 形状与最终布局同构（§9.5）：Orbi 位 + 卡片 + 两输入 + 胶囊提交钮 ——
 * 与 `LoginCard.css` 的 .login-stage 对齐，回落时不跳变。
 */
function AuthSkeleton() {
  return (
    <div className="login-stage">
      <div className="skeleton h-[168px] w-[168px] rounded-full" />
      <div className="login-card">
        <div className="skeleton h-7 w-20 rounded-chip" />
        <div className="skeleton mt-2 h-3.5 w-28 rounded-chip" />
        <div className="mt-7 space-y-4">
          <div className="skeleton h-[54px] w-full rounded-input" />
          <div className="skeleton h-[54px] w-full rounded-input" />
          <div className="skeleton h-[54px] w-full rounded-input" />
        </div>
      </div>
    </div>
  );
}

/**
 * 登录 / 注册 / 找回密码 / 重置密码。
 *
 * 2026-09-22 按「动画.docx」改成整屏舞台：Orbi + 卡片，**不再套 PageHeader** ——
 * 卡片自己带标题（登录 / 注册账号 / 找回密码），再加一行页头就是同一个意思说两遍，
 * 而且会把卡片挤出首屏（实测提交按钮和底部入口掉到折叠线以下）。
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <AuthClient />
    </Suspense>
  );
}

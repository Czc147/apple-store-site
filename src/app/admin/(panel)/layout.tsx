import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/auth';
import AdminShell from '@/components/admin/AdminShell';

export const metadata = {
  title: '管理后台',
  // 后台页面禁止被搜索引擎收录
  robots: { index: false, follow: false },
};

// 会话校验必须实时执行，禁止静态化
export const dynamic = 'force-dynamic';

/**
 * 后台访问控制：
 * 校验 admin_session cookie（HMAC 签名 + 7 天有效期），
 * 未登录 / 会话过期 → 重定向登录页。
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!verifySessionToken(token)) {
    redirect('/admin/login');
  }

  return <AdminShell>{children}</AdminShell>;
}

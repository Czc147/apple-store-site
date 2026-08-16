import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/auth';
import LoginForm from '@/components/admin/LoginForm';

export const metadata = { title: '登录' };

export const dynamic = 'force-dynamic';

/** 管理员登录页：已登录则直接回后台 */
export default function AdminLoginPage() {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (verifySessionToken(token)) {
    redirect('/admin');
  }
  return <LoginForm />;
}

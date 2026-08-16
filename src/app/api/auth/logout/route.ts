import { ok } from '@/lib/api';
import { ADMIN_COOKIE, sessionCookieOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** POST /api/auth/logout — 清除会话 cookie */
export async function POST() {
  const res = ok({ success: true });
  res.cookies.set(ADMIN_COOKIE, '', {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
  return res;
}

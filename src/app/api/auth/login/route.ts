import type { NextRequest } from 'next/server';
import { ok, fail, parseBody } from '@/lib/api';
import {
  ADMIN_COOKIE,
  SESSION_DAYS,
  createSessionToken,
  isAdminPasswordConfigured,
  safeEqualPassword,
  sessionCookieOptions,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** POST /api/auth/login — 管理员密码登录，成功后写入 7 天会话 cookie */
export async function POST(req: NextRequest) {
  if (!isAdminPasswordConfigured()) {
    return fail('服务端未配置 ADMIN_PASSWORD 环境变量，无法登录', 503);
  }

  const body = await parseBody(req);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) return fail('请输入密码');

  if (!safeEqualPassword(password)) {
    return fail('密码错误', 401);
  }

  const res = ok({ success: true });
  res.cookies.set(ADMIN_COOKIE, createSessionToken(), {
    ...sessionCookieOptions(),
    maxAge: SESSION_DAYS * 24 * 3600,
  });
  return res;
}

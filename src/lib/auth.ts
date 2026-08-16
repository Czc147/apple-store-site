import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * 简易管理员会话（HMAC 签名 cookie，无服务端存储）
 * - 密码来自环境变量 ADMIN_PASSWORD，同时用作 HMAC 密钥
 * - token 结构：`<过期时间戳>.<sha256-hmac>`，有效期 7 天
 * - 仅在 API Routes / 服务端组件中使用，严禁进入客户端 bundle
 */

export const ADMIN_COOKIE = 'admin_session';
export const SESSION_DAYS = 7;

function secret(): string | null {
  return process.env.ADMIN_PASSWORD || null;
}

/** 是否已配置管理员密码 */
export function isAdminPasswordConfigured(): boolean {
  return Boolean(secret());
}

function sign(payload: string): string {
  return createHmac('sha256', secret() ?? '').update(payload).digest('hex');
}

/** 生成 7 天有效期的会话 token */
export function createSessionToken(): string {
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  return `${expiresAt}.${sign(String(expiresAt))}`;
}

/** 校验会话 token：签名正确且未过期 */
export function verifySessionToken(
  token: string | null | undefined,
): boolean {
  if (!secret() || !token) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  const expected = sign(expStr);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** 校验请求 cookie 中的管理员会话（用于写操作鉴权） */
export function checkAdmin(req: NextRequest): boolean {
  return verifySessionToken(req.cookies.get(ADMIN_COOKIE)?.value);
}

/** 恒定时间比较密码（先各自 sha256 归一化长度，防时序攻击） */
export function safeEqualPassword(input: string): boolean {
  const pwd = secret();
  if (!pwd || !input) return false;
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(pwd).digest();
  return timingSafeEqual(a, b);
}

/** 会话 cookie 的公共选项（登录设置 / 退出清除共用） */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

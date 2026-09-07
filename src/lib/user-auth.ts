import type { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase/admin';

/**
 * 用户侧鉴权（Bearer access token，Supabase Auth）。
 * 与后台管理员的 HMAC cookie 会话（lib/auth.ts）是【两套独立体系】：
 * 用户接口只认 Bearer，管理接口只认 cookie，互不接受，防止越权。
 */

export interface AuthUser {
  /** auth.users.id */
  id: string;
  email: string | null;
}

/**
 * 短 TTL 内存缓存：同一 token 60s 内命中直接返回，跳过对 Supabase Auth 的
 * 网络往返（每个登录态接口都会调这个函数，未缓存时是每请求最大的延迟来源）。
 * 容量超限直接整体清空，避免无界增长；单进程/单实例场景足够。
 */
const AUTH_CACHE_TTL_MS = 60_000;
const AUTH_CACHE_MAX_SIZE = 500;
const authCache = new Map<string, { user: AuthUser | null; expiresAt: number }>();

/**
 * 从 Authorization: Bearer <token> 解析并校验用户。
 * 任何失败（无头 / token 无效 / 过期）一律返回 null（按未登录处理），
 * 调用方自行决定 401 还是降级为游客逻辑。
 */
export async function getRequestUser(
  req: NextRequest | Request,
): Promise<AuthUser | null> {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const cached = authCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  try {
    const { data, error } = await supabaseAdmin().auth.getUser(token);
    const user = error || !data?.user ? null : { id: data.user.id, email: data.user.email ?? null };
    if (authCache.size >= AUTH_CACHE_MAX_SIZE) authCache.clear();
    authCache.set(token, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
    return user;
  } catch {
    return null;
  }
}

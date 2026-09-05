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
  try {
    const { data, error } = await supabaseAdmin().auth.getUser(token);
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}

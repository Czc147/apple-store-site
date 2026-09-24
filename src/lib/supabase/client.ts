import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { makeSameOriginAuthFetch } from './same-origin-fetch';

let client: SupabaseClient | null = null;

/**
 * 浏览器端客户端（anon key，受 RLS 约束，只读）。
 * 前台页面查询数据使用本客户端；写入一律走 /api/* 服务端路由。
 *
 * ⚠️ Auth 请求经 `makeSameOriginAuthFetch` 改写成同源 `/api/sb/**`，
 *    浏览器不再直连 `*.supabase.co`（国内该域名被分 IP/分时段阻断，
 *    安卓用户直连会抛 `Failed to fetch` —— 2026-09-24 实测根因，
 *    详见同目录 same-origin-fetch.ts）。
 */
export function supabaseBrowser(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error(
        '缺少环境变量：SUPABASE_URL / SUPABASE_ANON_KEY（客户端使用需加 NEXT_PUBLIC_ 前缀）',
      );
    }
    // URL 不合法时不接管 fetch：宁可按原样工作（那种配置下环境变量本身已经是错的），
    // 也不要把登录页从「友好降级提示」变成未捕获异常
    let sameOriginAuth: typeof fetch | undefined;
    try {
      sameOriginAuth = makeSameOriginAuthFetch(new URL(url).origin);
    } catch {
      console.warn('[supabase] SUPABASE_URL 不是合法绝对 URL，已跳过同源代理');
    }

    client = createClient(url, anonKey, {
      // 只改写 auth 请求为同源；其余调用原样放行
      ...(sameOriginAuth ? { global: { fetch: sameOriginAuth } } : {}),
    });
  }
  return client;
}

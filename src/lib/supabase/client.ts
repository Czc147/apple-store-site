import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function proxiedAuthFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url || typeof window === 'undefined') return fetch(input, init);

  const rawUrl = input instanceof Request ? input.url : String(input);
  const parsedUrl = new URL(rawUrl);
  const parsedBase = new URL(url);
  if (parsedUrl.origin !== parsedBase.origin || !parsedUrl.pathname.startsWith('/auth/v1/')) {
    return fetch(input, init);
  }

  const authPath = parsedUrl.pathname.replace(/^\/auth\/v1\//, '');
  const proxiedUrl = `/api/supabase/auth/${authPath}${parsedUrl.search}`;
  if (input instanceof Request) {
    return fetch(proxiedUrl, {
      method: input.method,
      headers: input.headers,
      body: input.method === 'GET' || input.method === 'HEAD' ? undefined : input.body,
      cache: 'no-store',
      credentials: input.credentials,
      redirect: 'manual',
    });
  }
  return fetch(proxiedUrl, init);
}

/**
 * 浏览器端客户端（anon key，受 RLS 约束，只读）。
 * 前台页面查询数据使用本客户端；写入一律走 /api/* 服务端路由。
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
    client = createClient(url, anonKey, {
      global: { fetch: proxiedAuthFetch },
    });
  }
  return client;
}

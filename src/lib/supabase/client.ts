import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

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
    client = createClient(url, anonKey);
  }
  return client;
}

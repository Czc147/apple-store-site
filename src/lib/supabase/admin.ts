import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** 环境变量是否已配置（用于页面/API 优雅降级，避免直接抛错） */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * 服务端管理客户端（service_role key，绕过 RLS）。
 * ⚠️ 只允许在 API Routes / Netlify Functions 中使用，
 *    严禁在 'use client' 组件或任何前端代码中 import。
 */
export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error(
        '缺少环境变量：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY。' +
          '请复制 .env.local.example 为 .env.local 并填写（详见 README）',
      );
    }
    client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

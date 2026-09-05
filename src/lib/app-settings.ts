import { supabaseAdmin, isSupabaseConfigured } from './supabase/admin';
import type { AppSettings } from './types';

/**
 * 服务端读取全局配置（app_settings 表）。
 * 仅在服务端组件 / API 中调用；未配置或查询失败一律返回空对象，
 * 调用方自行回退默认文案（绝不让配置查询拖垮页面）。
 */
export async function getAppSettings(): Promise<AppSettings> {
  if (!isSupabaseConfigured()) return {};
  try {
    const { data, error } = await supabaseAdmin()
      .from('app_settings')
      .select('key, value');
    if (error) return {};
    const map: AppSettings = {};
    for (const row of (data ?? []) as Array<{ key: string; value: string | null }>) {
      map[row.key] = row.value ?? '';
    }
    return map;
  } catch {
    return {};
  }
}

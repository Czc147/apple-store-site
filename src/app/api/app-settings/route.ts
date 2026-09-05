import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 允许后台写入的配置键（白名单，防止任意键注入） */
const SETTING_KEYS = [
  'site_title',
  'home_greeting',
  'home_subtitle',
  'announcement',
] as const;

/** GET /api/app-settings — 全局配置（公开；返回 { key: value } 对象） */
export async function GET() {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const { data, error } = await supabaseAdmin()
    .from('app_settings')
    .select('key, value');
  if (error) return fail(error.message, 500);

  const map: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{ key: string; value: string | null }>) {
    map[row.key] = row.value ?? '';
  }
  return ok(map);
}

/** PUT /api/app-settings — 逐 key upsert（需管理员登录） */
export async function PUT(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');

  const entries = SETTING_KEYS.filter((k) => body[k] !== undefined).map((k) => ({
    key: k,
    value: typeof body[k] === 'string' ? body[k] : '',
    updated_at: new Date().toISOString(),
  }));
  if (entries.length === 0) return fail('没有可更新的配置项');

  const { error } = await supabaseAdmin()
    .from('app_settings')
    .upsert(entries, { onConflict: 'key' });
  if (error) return fail(error.message, 500);

  const map: Record<string, string> = {};
  for (const e of entries) map[e.key] = e.value;
  return ok(map);
}

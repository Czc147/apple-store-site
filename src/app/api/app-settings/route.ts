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
  'payment_wechat_qr_url',
  'payment_alipay_qr_url',
] as const;

/**
 * 前台可读的公开配置键（白名单，默认全拦）。
 * 只用白名单放行，不走黑名单：任何非公开 key（密钥、内部时间戳等）天然不会出现在
 * 公开响应里——即便以后往 app_settings 新增敏感项而忘了登记，也只影响「本级故意
 * 不放行」，绝不会误泄露。改公开项时同步加入 SETTING_KEYS 与 PUBLIC_KEYS 即可。
 */
const PUBLIC_KEYS = new Set<string>(SETTING_KEYS);

/** GET /api/app-settings — 全局配置（公开；仅返回白名单内的 key） */
export async function GET() {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const { data, error } = await supabaseAdmin()
    .from('app_settings')
    .select('key, value');
  if (error) return fail(error.message, 500);

  const map: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{ key: string; value: string | null }>) {
    if (!PUBLIC_KEYS.has(row.key)) continue;
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

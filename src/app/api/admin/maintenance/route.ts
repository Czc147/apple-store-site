import type { NextRequest } from 'next/server';
import { checkAdmin } from '@/lib/auth';
import { fail, parseBody } from '@/lib/api';
import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase/admin';
import { MAINTENANCE_KEY, parseMaintenance } from '@/siteMaintenance/logic';
import { readMaintenance } from '@/siteMaintenance/server';

export const dynamic = 'force-dynamic';
const json = (value: unknown) => Response.json(value, { headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  try { return json(await readMaintenance()); } catch { return fail('读取维护配置失败，请重试', 503); }
}

export async function PUT(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail('数据库尚未配置', 503);
  let value;
  try { value = parseMaintenance(await parseBody(req)); } catch (error) { return fail(error instanceof Error ? error.message : '维护配置格式不正确'); }
  try {
    const { error } = await supabaseAdmin().from('app_settings').upsert({ key: MAINTENANCE_KEY, value: JSON.stringify(value), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return fail('保存维护配置失败，请重试', 503);
    return json(value);
  } catch { return fail('保存维护配置失败，请重试', 503); }
}

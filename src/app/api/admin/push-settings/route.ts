import type { NextRequest } from 'next/server';
import { checkAdmin } from '@/lib/auth';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import {
  SERVERCHAN_SETTING_KEY,
  readServerchanSendkey,
  sendServerchan,
} from '@/lib/serverchan';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const mask = (key: string) => (key.length > 4 ? `${key.slice(0, 4)}****` : '****');

/** GET /api/admin/push-settings — 查看当前 Server酱 配置状态（不返回完整 key） */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const sendkey = await readServerchanSendkey(supabaseAdmin());
  return ok({
    configured: Boolean(sendkey),
    masked: sendkey ? mask(sendkey) : '',
  });
}

/**
 * POST /api/admin/push-settings — 设置/清除 Server酱 SendKey，或发送测试通知
 * body：
 *   { sendkey: string }      设置（空串=清除）
 *   { test: true }           用当前已保存的 key 发一条测试通知
 */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');

  const db = supabaseAdmin();

  if (body.test === true) {
    const sendkey = await readServerchanSendkey(db);
    if (!sendkey) return fail('请先填写 Server酱 SendKey', 400);
    const res = await sendServerchan(sendkey, '测试通知', '这是一条来自后台的**测试推送**。若收到，说明配置成功。');
    if (!res.ok) return fail(res.error ?? '发送失败', 500);
    return ok({ sent: true, message: '测试通知已发送，请到微信查看' });
  }

  const raw = typeof body.sendkey === 'string' ? body.sendkey.trim() : null;
  if (raw === null) return fail('sendkey 缺失');

  if (!raw) {
    const { error } = await db.from('app_settings').delete().eq('key', SERVERCHAN_SETTING_KEY);
    if (error) return fail(error.message, 500);
    return ok({ configured: false, masked: '' });
  }

  const { error } = await db
    .from('app_settings')
    .upsert({ key: SERVERCHAN_SETTING_KEY, value: raw, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return fail(error.message, 500);

  return ok({ configured: true, masked: mask(raw) });
}

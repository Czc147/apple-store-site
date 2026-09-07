import type { SupabaseClient } from '@supabase/supabase-js';

/** app_settings 中保存 Server酱 SendKey 的 key */
export const SERVERCHAN_SETTING_KEY = 'push_serverchan_sendkey';

export async function readServerchanSendkey(
  db: SupabaseClient,
): Promise<string> {
  const { data, error } = await db
    .from('app_settings')
    .select('value')
    .eq('key', SERVERCHAN_SETTING_KEY)
    .maybeSingle();
  if (error) return '';
  const value = data?.value as string | null;
  return value?.trim() ?? '';
}

/**
 * 推送一条 Server酱（微信）消息。
 * SendKey 形如 `SCT...`；接口为 POST https://sctapi.ftqq.com/<SendKey>.send，
 * form-encoded 传 title + desp。返回 { ok, error? }，绝不抛错（调用方吞掉）。
 */
export async function sendServerchan(
  sendkey: string,
  title: string,
  desp: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!sendkey) return { ok: false, error: '未配置 Server酱 SendKey' };
  try {
    const url = `https://sctapi.ftqq.com/${encodeURIComponent(sendkey)}.send`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ title, desp }).toString(),
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json().catch(() => null)) as {
      code?: number;
      message?: string;
    } | null;
    if (json?.code === 0) return { ok: true };
    return { ok: false, error: json?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '发送失败' };
  }
}

/** 组装新订单通知内容并推送（仅当已配置 SendKey 时；调用方 await try/catch 吞错） */
export async function notifyNewOrder(
  db: SupabaseClient,
  orderNo: string,
  total: number,
  itemCount: number,
  paymentMethod: string,
): Promise<void> {
  const sendkey = await readServerchanSendkey(db);
  if (!sendkey) return;
  const desp = [
    `**订单号**：\`${orderNo}\``,
    `**金额**：¥${total.toFixed(2)}`,
    `**商品件数**：${itemCount}`,
    `**支付方式**：${paymentMethod === 'wechat' ? '微信' : '支付宝'}`,
    '',
    '请进后台「订单管理」核销收款。',
  ].join('\n');
  await sendServerchan(sendkey, `新订单 ${orderNo}`, desp);
}

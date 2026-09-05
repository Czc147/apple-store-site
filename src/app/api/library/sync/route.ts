import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser, type AuthUser } from '@/lib/user-auth';
import { resolveTargetContent } from '@/lib/card-targets';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import type { CardTargetType } from '@/lib/card-types';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 单次同步的码数量上限（防一次性灌入过多） */
const MAX_SYNC_CODES = 20;

/** 卡密商品行（含兑换类型扩展列，迁移 005） */
interface ProductRow {
  id: string;
  description: string | null;
  target_type: CardTargetType | null;
  target_id: string | null;
  redeem_type: string | null;
  unlock_duration_days: number | null;
}

/** 单个码的同步结果（逐码返回，前端逐条展示） */
interface SyncResult {
  code: string;
  ok: boolean;
  /** success 新同步 / already 早已绑定本人 / bound_other 已被他人绑定 /
   *  not_redeemed 尚未兑换 / invalid 无效或作废 / error 内部错误 */
  reason: 'success' | 'already' | 'bound_other' | 'not_redeemed' | 'invalid' | 'error';
  message: string;
  kind?: 'unlock_daily' | 'content';
}

/** 掩码后的码（回显用，避免完整码进日志/响应） */
function masked(code: string): string {
  return code.length <= 4 ? '****' : `${code.slice(0, 2)}****${code.slice(-2)}`;
}

/**
 * POST /api/library/sync — 把本机（游客）兑换过的码同步绑定到当前账号
 *
 * 请求体：{ codes: string[] }
 * 逐码处理：
 * - unlock_daily 码：CAS 绑定 → grant_daily_plan（原子叠加延期）
 * - content 码：CAS 绑定 → 写 content 权益（快照商品名/兑换内容，幂等）
 * 幂等：已被本人绑定 → already；被他人绑定 → bound_other；未核销 → not_redeemed。
 *
 * 响应：{ results: SyncResult[] }
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  if (!rateLimit('library-sync', getClientIp(req), 10, 60_000)) {
    return fail('操作过于频繁，请稍后再试', 429);
  }

  const body = await parseBody(req);
  const rawCodes = Array.isArray(body?.codes) ? body.codes : [];
  if (rawCodes.length === 0) return fail('没有需要同步的码');
  if (rawCodes.length > MAX_SYNC_CODES) {
    return fail(`一次最多同步 ${MAX_SYNC_CODES} 个码`);
  }

  const db = supabaseAdmin();
  const results: SyncResult[] = [];
  for (const raw of rawCodes) {
    const code = typeof raw === 'string' ? raw.trim() : '';
    if (!code) {
      results.push({ code: '', ok: false, reason: 'invalid', message: '空码已跳过' });
      continue;
    }
    results.push(await syncOneCode(db, user, code));
  }

  return ok({ results });
}

/** 同步单个码到账号 */
async function syncOneCode(
  db: ReturnType<typeof supabaseAdmin>,
  user: AuthUser,
  code: string,
): Promise<SyncResult> {
  const display = masked(code);

  // 1) 查卡密（同内容可能多行，取已核销的优先）
  const { data: keys, error: keysErr } = await db
    .from('card_keys')
    .select('id, card_product_id, status, bound_user_id')
    .eq('content', code)
    .order('created_at', { ascending: true });
  if (keysErr) {
    return { code: display, ok: false, reason: 'error', message: keysErr.message };
  }
  const rows = (keys ?? []) as Array<{
    id: string;
    card_product_id: string;
    status: string;
    bound_user_id: string | null;
  }>;
  if (rows.length === 0) {
    return { code: display, ok: false, reason: 'invalid', message: '兑换码不存在' };
  }

  const issued = rows.find((r) => r.status === 'issued');
  if (!issued) {
    const hasUnused = rows.some((r) => r.status === 'unused');
    return hasUnused
      ? { code: display, ok: false, reason: 'not_redeemed', message: '该码尚未兑换，请先在兑换页兑换' }
      : { code: display, ok: false, reason: 'invalid', message: '兑换码已作废' };
  }

  // 2) 读商品判断兑换类型
  const { data: product, error: pErr } = await db
    .from('card_products')
    .select('id, description, target_type, target_id, redeem_type, unlock_duration_days')
    .eq('id', issued.card_product_id)
    .maybeSingle();
  if (pErr) return { code: display, ok: false, reason: 'error', message: pErr.message };
  const prod = product as ProductRow | null;
  if (!prod) {
    return { code: display, ok: false, reason: 'invalid', message: '码关联的商品不存在' };
  }
  const isUnlock = prod.redeem_type === 'unlock_daily';

  // 3) CAS 绑定（仅未绑定时写入）
  const { data: boundRows, error: bindErr } = await db
    .from('card_keys')
    .update({ bound_user_id: user.id })
    .eq('id', issued.id)
    .is('bound_user_id', null)
    .select('id');
  if (bindErr) return { code: display, ok: false, reason: 'error', message: bindErr.message };
  const freshBind = (boundRows ?? []).length > 0;

  if (!freshBind) {
    // 已绑定：本人 → 幂等成功；他人 → 拒绝
    const { data: cur, error: curErr } = await db
      .from('card_keys')
      .select('bound_user_id')
      .eq('id', issued.id)
      .maybeSingle();
    if (curErr) return { code: display, ok: false, reason: 'error', message: curErr.message };
    const boundTo = (cur as { bound_user_id: string | null } | null)?.bound_user_id;
    if (boundTo === user.id) {
      return {
        code: display,
        ok: true,
        reason: 'already',
        message: isUnlock ? '每日计划已在此前同步' : '该内容已在此前同步',
        kind: isUnlock ? 'unlock_daily' : 'content',
      };
    }
    return { code: display, ok: false, reason: 'bound_other', message: '该码已绑定其它账号' };
  }

  // 4) 新绑定成功 → 写权益
  if (isUnlock) {
    const durationDays =
      typeof prod.unlock_duration_days === 'number' ? prod.unlock_duration_days : null;
    const { error: rpcErr } = await db.rpc('grant_daily_plan', {
      p_user_id: user.id,
      p_user_email: user.email,
      p_card_key_id: issued.id,
      p_duration_days: durationDays,
      p_source: 'sync',
    });
    if (rpcErr) return { code: display, ok: false, reason: 'error', message: rpcErr.message };
    return { code: display, ok: true, reason: 'success', message: '每日计划已同步到账号', kind: 'unlock_daily' };
  }

  // content：解析快照（目标已删除时回退商品描述）
  let name = prod.description ?? '兑换内容';
  let mediaUrl: string | null = null;
  if (prod.target_type && prod.target_id) {
    try {
      const c = await resolveTargetContent(prod.target_type, prod.target_id);
      if (c) {
        name = c.name;
        mediaUrl = c.redeem_image_url;
      }
    } catch {
      /* 解析失败回退描述，不阻断同步 */
    }
  }
  const { error: insErr } = await db.from('user_entitlements').insert({
    user_id: user.id,
    user_email: user.email,
    kind: 'content',
    card_key_id: issued.id,
    name,
    description: prod.description,
    media_url: mediaUrl,
    target_type: prod.target_type,
    target_id: prod.target_id,
    source: 'sync',
  });
  // 23505 = 同用户同码已有权益 → 幂等忽略
  if (insErr && insErr.code !== '23505') {
    return { code: display, ok: false, reason: 'error', message: insErr.message };
  }
  return { code: display, ok: true, reason: 'success', message: '兑换内容已同步到账号', kind: 'content' };
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { collectKeyIdsToVoid, voidKeys } from '@/lib/entitlements-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

type Ctx = { params: { id: string } };

/**
 * POST /api/entitlements/:id/revoke — 撤销用户权益（管理端，HMAC cookie 鉴权）
 *
 * 撤销 = 删权益 + 作废关联卡密，两步缺一不可：
 * 1. 作废卡密（先做）：status='void' + 清 bound_user_id。
 *    - content 权益：作废其来源码；
 *    - daily_plan 权益：作废该用户名下全部「解锁每日计划」类已绑定卡密
 *      （叠加兑换可能用过多个码，只作废最近一个会留复活后门：
 *        旧码仍是 issued，游客态直接拿它当凭证即可绕过撤销）。
 *    作废后 redeem / library-sync 都会把该码当无效码，防止重放复活。
 * 2. 删权益行：/api/daily-access（Bearer）与「我的库」立即回到未解锁。
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const db = supabaseAdmin();

  const { data: ent, error: readErr } = await db
    .from('user_entitlements')
    .select('id, user_id, kind, card_key_id')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) return fail(readErr.message, 500);
  const row = ent as {
    id: string;
    user_id: string;
    kind: string;
    card_key_id: string | null;
  } | null;
  if (!row) return fail('权益不存在', 404);

  // 1. 先作废关联卡密（失败即中止，权益保持不动，可重试）
  let keyIds: string[] = [];
  try {
    keyIds = await collectKeyIdsToVoid(db, row);
    await voidKeys(db, keyIds);
  } catch (e) {
    return fail(e instanceof Error ? e.message : '作废卡密失败', 500);
  }

  // 2. 再删权益行
  const { error: delErr } = await db
    .from('user_entitlements')
    .delete()
    .eq('id', row.id);
  if (delErr) return fail(delErr.message, 500);

  return ok({ success: true, id: row.id, voided_keys: keyIds.length });
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { CARD_KEY_STATUS, REDEEM_TYPE } from '@/lib/card-types';

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
  const keyIds = await collectKeyIdsToVoid(db, row);
  if (keyIds.length > 0) {
    const { error: voidErr } = await db
      .from('card_keys')
      .update({ status: CARD_KEY_STATUS.VOID, bound_user_id: null })
      .in('id', keyIds);
    if (voidErr) return fail(voidErr.message, 500);
  }

  // 2. 再删权益行
  const { error: delErr } = await db
    .from('user_entitlements')
    .delete()
    .eq('id', row.id);
  if (delErr) return fail(delErr.message, 500);

  return ok({ success: true, id: row.id, voided_keys: keyIds.length });
}

/**
 * 计算需要作废的卡密 id 集合：
 * - content：仅来源码；
 * - daily_plan：该用户绑定的全部「解锁每日计划」商品下的卡密（覆盖叠加兑换的多个码）。
 */
async function collectKeyIdsToVoid(
  db: ReturnType<typeof supabaseAdmin>,
  ent: { user_id: string; kind: string; card_key_id: string | null },
): Promise<string[]> {
  if (ent.kind !== 'daily_plan') {
    return ent.card_key_id ? [ent.card_key_id] : [];
  }

  const { data: boundKeys, error: keysErr } = await db
    .from('card_keys')
    .select('id, card_product_id')
    .eq('bound_user_id', ent.user_id);
  if (keysErr || !boundKeys || boundKeys.length === 0) {
    return ent.card_key_id ? [ent.card_key_id] : [];
  }

  const rows = boundKeys as Array<{ id: string; card_product_id: string }>;
  const productIds = Array.from(new Set(rows.map((k) => k.card_product_id)));
  const { data: products, error: prodErr } = await db
    .from('card_products')
    .select('id, redeem_type')
    .in('id', productIds);
  if (prodErr || !products) return ent.card_key_id ? [ent.card_key_id] : [];

  const unlockProductIds = new Set(
    (products as Array<{ id: string; redeem_type: string }>)
      .filter((p) => p.redeem_type === REDEEM_TYPE.UNLOCK_DAILY)
      .map((p) => p.id),
  );
  const ids = rows
    .filter((k) => unlockProductIds.has(k.card_product_id))
    .map((k) => k.id);
  // 兜底：来源码未在绑定集合中时也一并作废
  if (ent.card_key_id && !ids.includes(ent.card_key_id)) ids.push(ent.card_key_id);
  return ids;
}

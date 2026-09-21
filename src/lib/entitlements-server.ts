import type { supabaseAdmin } from '@/lib/supabase/admin';
import { CARD_KEY_STATUS, REDEEM_TYPE } from '@/lib/card-types';

/**
 * 撤销权益时「要作废哪些卡密」的共用计算（单条撤销 /api/entitlements/[id]/revoke
 * 与批量撤销 /api/admin/bulk-delete 共用，逻辑与迁移 005 的注释口径一致）：
 * - content：仅该权益行来源的那把码；
 * - daily_plan：该用户绑定的全部「解锁每日计划」商品下的卡密
 *   （叠加兑换会有多个码，只作废来源码会导致旧码重放复活权益）。
 * 任何查询异常都退化为「来源码」兜底，保证撤销本身不被卡密读失败阻断。
 */
export async function collectKeyIdsToVoid(
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

/** 供批量撤销复用：作废指定卡密（置 void 并清绑定，防重放复活） */
export async function voidKeys(
  db: ReturnType<typeof supabaseAdmin>,
  keyIds: string[],
): Promise<void> {
  if (keyIds.length === 0) return;
  const { error } = await db
    .from('card_keys')
    .update({ status: CARD_KEY_STATUS.VOID, bound_user_id: null })
    .in('id', keyIds);
  if (error) throw new Error(error.message);
}

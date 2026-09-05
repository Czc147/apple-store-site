/**
 * 卡密商品「兑换类型 / 有效天数」字段解析（迁移 005）。
 * products 的 POST（新建）与 PUT（更新）路由共用，保证两处校验口径一致。
 *
 * - redeem_type：content（默认）/ unlock_daily；未提供时返回 null，
 *   由调用方决定默认值（POST 落 content，PUT 视为「未更新此字段」）。
 * - unlock_duration_days：正整数天数；未提供 / 空串 → null（表示「永久」），
 *   非法输入返回错误文案（后台表单可直接展示）。
 */
import { REDEEM_TYPE_VALUES, type RedeemType } from './card-types';

/** 字段解析结果：ok=true 时 value 为 null 表示「未提供/置空」，specified 区分两者 */
export type Parsed<T> =
  | { ok: true; value: T | null; specified: boolean }
  | { ok: false; error: string };

/** 解析 redeem_type；未提供返回 null（不报错），非法值返回错误文案 */
export function parseRedeemType(raw: unknown): Parsed<RedeemType> {
  if (raw === undefined) return { ok: true, value: null, specified: false };
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!REDEEM_TYPE_VALUES.includes(v as RedeemType)) {
    return { ok: false, error: '兑换类型必须为「兑换内容」或「解锁每日计划」' };
  }
  return { ok: true, value: v as RedeemType, specified: true };
}

/** 解析有效天数；未提供 / 空串 → null（永久），非法值返回错误文案 */
export function parseUnlockDurationDays(raw: unknown): Parsed<number> {
  if (raw === undefined) return { ok: true, value: null, specified: false };
  if (raw === null || raw === '') return { ok: true, value: null, specified: true };
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    return { ok: false, error: '有效天数必须是正整数（留空即永久有效）' };
  }
  return { ok: true, value: n, specified: true };
}

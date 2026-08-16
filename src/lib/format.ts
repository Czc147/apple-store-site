/** 展示层格式化工具 */

/**
 * 价格格式化：¥xx.xx
 * Supabase numeric 列可能返回字符串，这里统一安全转换。
 */
export function formatPrice(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? `¥${n.toFixed(2)}` : '¥0.00';
}

/** 安全转数字（用于入库/入 store 前的归一化） */
export function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

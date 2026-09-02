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

/** 本地时区日期时间：2026-08-24 14:30（空值 / 非法值显示「—」） */
export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 敏感内容遮罩：仅保留末尾若干位（卡密 / 取卡码后台默认展示用）。
 * 内容长度不足时全部遮罩，避免短内容被直接猜出。
 */
export function maskTail(text: string, keep = 4): string {
  if (!text) return '';
  if (text.length <= keep) return '*'.repeat(Math.max(text.length, 4));
  return `****${text.slice(-keep)}`;
}

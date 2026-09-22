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

/** 到期时间 → YYYY-MM-DD（仅日期；空值 / 非法值返回空串）。
    原 LibraryClient / RedeemClient 各有一份逐字重复，2026-09-09 收敛至此 */
export function formatExpiry(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 相对时间（刚刚 / N 分钟前 / N 小时前 / N 天前）；未来/非法值回退「刚刚」。
    原 NotificationBell 私有函数，Phase 6 提为公共（社区帖/评论时间戳用） */
export function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff) || diff < 0) return '刚刚';
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
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

/**
 * VIP 折扣百分比 → 中文折扣文案。
 * 传入的是**减掉的百分比**（与 coupons.value 同口径）：20 → 「8 折」。
 * 放在 format.ts 而不是 vip-benefits.ts，是因为 vip-benefits 依赖服务端模块
 * （coupons-server），客户端组件不能 import 它。
 */
export function formatDiscountRate(percent: number): string {
  const zhe = (100 - Number(percent)) / 10;
  if (!Number.isFinite(zhe) || zhe <= 0) return '';
  // 最多一位小数：7.5 折 而不是 7.500000000000001 折
  return `${Math.round(zhe * 10) / 10} 折`;
}

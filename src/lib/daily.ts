/**
 * 每日推荐共享工具（前台 / 后台 / API 共用）
 * 「一天一条」以管理员指定的 pick_date（YYYY-MM-DD）为准；
 * 「今日」按北京时区（Asia/Shanghai）计算，避免服务器时区跨零点歧义。
 */

import type { DailyPick, DailyPickTeaser } from './types';

/** 日期格式校验：YYYY-MM-DD 且是真实存在的日期 */
export function isValidPickDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return false;
  const d = new Date(`${v.trim()}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

/** 北京时区今天：'YYYY-MM-DD'（en-CA locale 输出即 ISO 日期格式） */
export function todayDateCN(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** 是否有正文内容（媒体文件或跳转链接） */
export function pickHasContent(
  pick: Pick<DailyPick, 'media_path' | 'link_url'>,
): boolean {
  return Boolean(pick.media_path || pick.link_url);
}

/**
 * 前台 teaser 投影：只保留未解锁也可见的字段，
 * 绝不携带 media_path / description 等付费内容信息。
 */
export function toTeaser(pick: DailyPick): DailyPickTeaser {
  return {
    pick_date: pick.pick_date,
    title: pick.title,
    cover_url: pick.cover_url,
    has_content: pickHasContent(pick),
  };
}

/** 中文友好日期：'2026-09-05' → '9月5日' */
export function formatPickDate(pickDate: string): string {
  const parts = pickDate.split('-');
  if (parts.length !== 3) return pickDate;
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

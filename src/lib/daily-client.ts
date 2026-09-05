/**
 * 每日推荐·客户端取数工具（'use client' 组件使用）。
 * 凭证优先级：登录 Bearer → 游客本地已核销码；两者皆无时不发请求。
 * 注意：仅类型层面引用服务端模块（type import 编译期擦除），
 * 运行时绝不 import lib/daily-access / lib/supabase/admin。
 */

import type { DailyAccessStatus } from './daily-access';

export type { DailyAccessStatus };

/** 客户端锁定位（与服务端 DAILY_LOCKED 同构，避免打包进服务端依赖） */
export const DAILY_LOCKED: DailyAccessStatus = {
  unlocked: false,
  permanent: false,
  expired: false,
  expires_at: null,
  remaining_days: null,
};

/** /api/daily-content 成功响应 */
export interface DailyContent {
  pick_date: string;
  title: string;
  description: string | null;
  link_url: string | null;
  media_url: string | null;
  media_kind: 'image' | 'video' | 'doc' | null;
}

function normalizeStatus(data: unknown): DailyAccessStatus {
  if (!data || typeof data !== 'object') return DAILY_LOCKED;
  const o = data as Record<string, unknown>;
  return {
    unlocked: o.unlocked === true,
    permanent: o.permanent === true,
    expired: o.expired === true,
    expires_at: typeof o.expires_at === 'string' ? o.expires_at : null,
    remaining_days:
      typeof o.remaining_days === 'number' ? o.remaining_days : null,
  };
}

/**
 * 查询解锁状态。任何失败（网络/未配置）一律按「未解锁」处理，
 * 保证区块永远渲染为保守的锁定态，不泄露内容。
 */
export async function fetchDailyAccess(
  getAuthHeaders: () => Promise<Record<string, string>>,
  code: string | null,
): Promise<DailyAccessStatus> {
  try {
    const headers = await getAuthHeaders();
    const hasAuth = Boolean(headers.Authorization);
    if (!hasAuth && !code) return DAILY_LOCKED;
    const res = await fetch('/api/daily-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(hasAuth ? { code: code ?? undefined } : { code }),
    });
    if (!res.ok) return DAILY_LOCKED;
    return normalizeStatus(await res.json());
  } catch {
    return DAILY_LOCKED;
  }
}

/**
 * 获取某日正文内容（签名链接 1 小时有效；组件内缓存，403/失败返回 null）。
 */
export async function fetchDailyContent(
  pickDate: string,
  getAuthHeaders: () => Promise<Record<string, string>>,
  code: string | null,
): Promise<DailyContent | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/daily-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ pick_date: pickDate, code: code ?? undefined }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<DailyContent>;
    if (!data || typeof data.title !== 'string') return null;
    return {
      pick_date: String(data.pick_date ?? pickDate),
      title: data.title,
      description: data.description ?? null,
      link_url: data.link_url ?? null,
      media_url: data.media_url ?? null,
      media_kind:
        data.media_kind === 'image' ||
        data.media_kind === 'video' ||
        data.media_kind === 'doc'
          ? data.media_kind
          : null,
    };
  } catch {
    return null;
  }
}

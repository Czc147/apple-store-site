/**
 * 「我的库」·客户端取数工具（'use client' 组件使用）。
 * 仅类型层面引用服务端模块（type import 编译期擦除），
 * 运行时绝不 import lib/supabase/admin / lib/daily-access 的实现。
 */
import type { UserEntitlement } from './types';
import type { DailyAccessStatus } from './daily-client';

/** GET /api/library 成功响应 */
export interface LibraryResponse {
  user: { id: string; email: string | null };
  /** 每日计划权益行（无则 null） */
  daily_plan: UserEntitlement | null;
  /** 每日计划实时状态（服务端现算） */
  daily_status: DailyAccessStatus;
  /** content 类权益列表（含商品快照） */
  contents: UserEntitlement[];
}

/** POST /api/library/sync 的单码结果 */
export interface SyncResultItem {
  code: string;
  ok: boolean;
  reason: 'success' | 'already' | 'bound_other' | 'not_redeemed' | 'invalid' | 'error';
  message: string;
  kind?: 'unlock_daily' | 'content';
}

/** 拉取「我的库」（未登录 / 失败返回 null） */
export async function fetchLibrary(
  getAuthHeaders: () => Promise<Record<string, string>>,
): Promise<LibraryResponse | null> {
  try {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) return null;
    const res = await fetch('/api/library', { headers });
    if (!res.ok) return null;
    return (await res.json()) as LibraryResponse;
  } catch {
    return null;
  }
}

/** 把本机码同步到账号，返回逐码结果（失败返回 null） */
export async function syncLibrary(
  getAuthHeaders: () => Promise<Record<string, string>>,
  codes: string[],
): Promise<SyncResultItem[] | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/library/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ codes }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results: SyncResultItem[] };
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return null;
  }
}

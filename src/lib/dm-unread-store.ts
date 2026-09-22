'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/auth-context';

/**
 * 私信未读总数（「对话」按钮上的红点数据源）。
 *
 * 用户 2026-09-22 要求：新消息不能只体现在会话行上，**「对话」按钮本身也要有红点** ——
 * 人在「交流/共享/一起买」板块时根本看不到会话行，没有这个点就完全不知道有人找。
 * 主底部导航的「探究」Tab 也用同一份数据（人不在广场时至少能看见）。
 *
 * 与 lib/notifications-store.ts、lib/wishlist.ts 同构（useSyncExternalStore 极简 store）：
 * 登录态下全局只有一个 30s 轮询，两个角标共用；未登录不轮询、恒为 0，登出清空。
 */

let unread = 0;
/** 登录态世代：登出/重置时自增，令在飞的旧响应作废 */
let epoch = 0;
const listeners = new Set<() => void>();

/** 轮询间隔（与通知轮询一致） */
const POLL_MS = 30_000;

type GetAuthHeaders = () => Promise<Record<string, string>>;

function emit() {
  listeners.forEach((l) => l());
}

function setUnread(next: number) {
  if (unread === next) return;
  unread = next;
  emit();
}

let inFlight: Promise<void> | null = null;

/** 拉一次未读数；多个订阅者共享在飞请求 */
async function refresh(getAuthHeaders: GetAuthHeaders): Promise<void> {
  if (inFlight) return inFlight;
  const myEpoch = epoch;
  inFlight = (async () => {
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) return;
      const res = await fetch('/api/dm/unread', { headers });
      if (!res.ok) return;
      const data = (await res.json()) as { unread?: number };
      if (myEpoch !== epoch) return; // 期间已登出：丢弃
      setUnread(typeof data.unread === 'number' ? data.unread : 0);
    } catch {
      /* 静默，下次轮询重试 */
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function reset() {
  epoch += 1;
  setUnread(0);
}

/* ----------------------------------------------------------
   轮询：全局单例，按订阅者引用计数启停
   ---------------------------------------------------------- */
let pollers = 0;
let timer: number | null = null;

function startPolling(getAuthHeaders: GetAuthHeaders): () => void {
  pollers += 1;
  if (timer === null) {
    void refresh(getAuthHeaders);
    timer = window.setInterval(() => void refresh(getAuthHeaders), POLL_MS);
  }
  return () => {
    pollers -= 1;
    if (pollers <= 0) {
      pollers = 0;
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    }
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): number {
  return unread;
}

/**
 * 未读数 hook：登录态自动轮询（登出清零）。
 * 另外暴露 `refresh()`：读完消息（会把服务端标为已读）后立刻重拉，
 * 免得红点要等到下一个 30s 周期才消。
 */
export function useDmUnread() {
  const { user, loading, getAuthHeaders } = useAuth();
  const value = useSyncExternalStore(subscribe, getSnapshot, () => 0);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      reset();
      return;
    }
    return startPolling(getAuthHeaders);
  }, [loading, user?.id, getAuthHeaders]);

  return { unread: value, refresh: () => refresh(getAuthHeaders) };
}

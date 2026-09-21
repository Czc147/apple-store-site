'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { Notification } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';

/**
 * 通知（列表 + 未读数）跨组件共享的外部 store：
 * 「我的库」内的通知铃与底部导航「我的库」Tab 角标共用同一份数据 ——
 * 登录态下全局只有一个 30s 轮询（两个组件同时挂载也只拉一次），
 * 读通知（单条 / 全部）后直接改本 store，角标立刻消。
 * 与 lib/wishlist.ts、lib/unlocks.ts 同构（useSyncExternalStore 极简 store）。
 *
 * 未登录不轮询、角标恒为 0；登出时清空（含丢弃在飞响应，防串号）。
 */

interface State {
  items: Notification[];
  /** 未读条数（角标数据源） */
  unread: number;
  /** 「全部已读」请求进行中 */
  busy: boolean;
}

const EMPTY: State = { items: [], unread: 0, busy: false };

/** 轮询间隔（与通知铃原行为一致） */
const POLL_MS = 30_000;

type GetAuthHeaders = () => Promise<Record<string, string>>;

let state: State = EMPTY;
/** 登录态世代：登出/重置时自增，令在飞的旧响应作废 */
let epoch = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(next: State) {
  state = next;
  emit();
}

/** 未读条数（items 的派生值，统一在写入处现算，避免两处漂移） */
function unreadOf(items: Notification[]): number {
  return items.filter((n) => !n.read_at).length;
}

/* ----------------------------------------------------------
   取数 / 变更（供 store 内部与 hook 调用）
   ---------------------------------------------------------- */

let inFlight: Promise<void> | null = null;

/** 拉取通知列表；同一时刻只发一次（多个轮询订阅者共享在飞请求） */
async function refresh(getAuthHeaders: GetAuthHeaders): Promise<void> {
  if (inFlight) return inFlight;
  const myEpoch = epoch;
  inFlight = (async () => {
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) return;
      const res = await fetch('/api/notifications', { headers });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: Notification[]; unread_count?: number };
      if (myEpoch !== epoch) return; // 期间已登出：丢弃
      const items = Array.isArray(data.items) ? data.items : [];
      setState({
        items,
        unread: typeof data.unread_count === 'number' ? data.unread_count : unreadOf(items),
        busy: false,
      });
    } catch {
      /* 静默，下次轮询重试 */
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** 单条标记已读（POST 成功后本地同步，不整表重拉） */
async function markRead(getAuthHeaders: GetAuthHeaders, id: string): Promise<void> {
  if (state.items.find((n) => n.id === id)?.read_at) return;
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/notifications/${id}/read`, { method: 'POST', headers });
    if (!res.ok) return;
    const items = state.items.map((n) =>
      n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n,
    );
    setState({ ...state, items, unread: unreadOf(items) });
  } catch {
    /* 忽略，下次轮询纠正 */
  }
}

/** 全部标记已读 */
async function markAllRead(getAuthHeaders: GetAuthHeaders): Promise<void> {
  if (state.busy || state.unread === 0) return;
  setState({ ...state, busy: true });
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/notifications/read-all', { method: 'POST', headers });
    if (!res.ok) {
      setState({ ...state, busy: false });
      return;
    }
    const now = new Date().toISOString();
    const items = state.items.map((n) => ({ ...n, read_at: n.read_at ?? now }));
    setState({ items, unread: 0, busy: false });
  } catch {
    setState({ ...state, busy: false });
  }
}

/** 清空（未登录 / 登出）：同时作废在飞响应 */
function reset() {
  epoch += 1;
  if (state !== EMPTY) setState(EMPTY);
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

/* ----------------------------------------------------------
   订阅接口（未导出：组件一律走 useNotifications）
   ---------------------------------------------------------- */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): State {
  return state;
}

/**
 * 通知数据 hook：登录态自动开启轮询（登出清零），返回值可直接渲染。
 * 多个组件同时使用时共享同一个轮询与同一份状态。
 */
export function useNotifications() {
  const { user, loading, getAuthHeaders } = useAuth();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  useEffect(() => {
    if (loading) return; // 登录态未定时不动作，避免闪一下空角标
    if (!user) {
      reset();
      return;
    }
    return startPolling(getAuthHeaders);
  }, [loading, user?.id, getAuthHeaders]);

  return {
    items: snapshot.items,
    unread: snapshot.unread,
    busy: snapshot.busy,
    markRead: (id: string) => markRead(getAuthHeaders, id),
    markAllRead: () => markAllRead(getAuthHeaders),
  };
}

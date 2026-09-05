'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * 游客本地库（localStorage）：兑换记录与每日计划解锁状态的本机保存。
 * 与 lib/wishlist.ts 同构的极简外部 store（useSyncExternalStore）。
 *
 * ⚠️ 本地数据只是「便利缓存」：
 * - 解锁是否有效、何时到期，一律以服务端 /api/daily-access 现算为准
 *   （本地 expires_at 仅供未联网时的展示回退）；
 * - 登录账号后 user_entitlements 才是权威（「我的库」页），
 *   本地码可一键同步绑定到账号（POST /api/library/sync）。
 */

/** 每日计划解锁记录（游客凭证 = 已核销的兑换码本身） */
export interface LocalDailyPlan {
  /** 已核销的解锁码：本机查看每日内容的凭证，也是登录后同步绑定的依据 */
  code: string;
  redeemed_at: string;
  /** 兑换时服务端算出的到期时间；null = 永久（展示回退用，权威在服务端） */
  expires_at: string | null;
}

/** 游客本地已兑换的内容记录（现有 content 类兑换） */
export interface LocalContentItem {
  code: string;
  name: string;
  description: string | null;
  media_url: string;
  redeemed_at: string;
}

interface LocalLibrary {
  daily_plan: LocalDailyPlan | null;
  contents: LocalContentItem[];
  /** 登录账号后是否已完成同步（同步过后不再弹提示） */
  synced: boolean;
}

const STORAGE_KEY = 'apple-store.library.v1';

const EMPTY: LocalLibrary = { daily_plan: null, contents: [], synced: false };

/* ----------------------------------------------------------
   极简外部 store：localStorage 持久化 + 订阅通知
   ---------------------------------------------------------- */
let state: LocalLibrary | null = null; // null = 尚未从 localStorage 载入
const listeners = new Set<() => void>();

function isValidDailyPlan(v: unknown): v is LocalDailyPlan {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.code === 'string' && o.code !== '';
}

function isValidContent(v: unknown): v is LocalContentItem {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.code === 'string' &&
    o.code !== '' &&
    typeof o.name === 'string' &&
    typeof o.media_url === 'string'
  );
}

function load(): LocalLibrary {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY };
    const o = parsed as Record<string, unknown>;
    return {
      daily_plan: isValidDailyPlan(o.daily_plan)
        ? {
            code: o.daily_plan.code,
            redeemed_at:
              typeof o.daily_plan.redeemed_at === 'string'
                ? o.daily_plan.redeemed_at
                : new Date().toISOString(),
            expires_at:
              typeof o.daily_plan.expires_at === 'string'
                ? o.daily_plan.expires_at
                : null,
          }
        : null,
      contents: Array.isArray(o.contents)
        ? o.contents.filter(isValidContent).map((c) => ({
            code: c.code,
            name: c.name,
            description:
              typeof c.description === 'string' ? c.description : null,
            media_url: c.media_url,
            redeemed_at:
              typeof c.redeemed_at === 'string'
                ? c.redeemed_at
                : new Date().toISOString(),
          }))
        : [],
      synced: o.synced === true,
    };
  } catch {
    return { ...EMPTY };
  }
}

function ensure(): LocalLibrary {
  if (state === null) {
    state = typeof window === 'undefined' ? EMPTY : load();
  }
  return state;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ensure()));
  } catch {
    /* 隐私模式等场景写入失败时静默降级为内存态 */
  }
}

function emit() {
  listeners.forEach((l) => l());
}

function setState(next: LocalLibrary) {
  state = next;
  persist();
  emit();
}

export const localLibraryStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): LocalLibrary {
    return ensure();
  },

  /** 记录/更新每日计划解锁（兑换成功时调用） */
  setDailyPlan(plan: LocalDailyPlan) {
    setState({ ...ensure(), daily_plan: plan, synced: false });
  },

  /** 记录内容兑换（同码重复兑换时覆盖旧记录） */
  addContent(item: LocalContentItem) {
    const current = ensure();
    setState({
      ...current,
      contents: [item, ...current.contents.filter((c) => c.code !== item.code)],
      synced: false,
    });
  },

  /** 登录同步完成后标记（不再弹「同步本机记录」提示） */
  markSynced() {
    setState({ ...ensure(), synced: true });
  },

  /** 待同步的本机码列表（每日计划码 + 内容码） */
  pendingCodes(): string[] {
    const s = ensure();
    const codes: string[] = [];
    if (s.daily_plan) codes.push(s.daily_plan.code);
    for (const c of s.contents) {
      if (!codes.includes(c.code)) codes.push(c.code);
    }
    return codes;
  },

  /** 是否有本机兑换记录（游客态「我的库」是否有东西可展示） */
  hasAny(): boolean {
    const s = ensure();
    return Boolean(s.daily_plan) || s.contents.length > 0;
  },

  clear() {
    setState({ ...EMPTY });
  },
};

/* 跨标签页同步：兑换页写入后，选购页区块 / 我的库立即刷新 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      state = null; // 下次 getSnapshot 时重新读取
      emit();
    }
  });
}

/** React Hook：在组件中订阅游客本地库 */
export function useLocalLibrary() {
  const lib = useSyncExternalStore(
    localLibraryStore.subscribe,
    localLibraryStore.getSnapshot,
    () => EMPTY, // 服务端快照：SSR 一律空，避免水合不一致
  );

  const setDailyPlan = useCallback(
    (plan: LocalDailyPlan) => localLibraryStore.setDailyPlan(plan),
    [],
  );
  const addContent = useCallback(
    (item: LocalContentItem) => localLibraryStore.addContent(item),
    [],
  );
  const markSynced = useCallback(() => localLibraryStore.markSynced(), []);
  const pendingCodes = useCallback(() => localLibraryStore.pendingCodes(), []);
  const clear = useCallback(() => localLibraryStore.clear(), []);

  return {
    dailyPlan: lib.daily_plan,
    contents: lib.contents,
    synced: lib.synced,
    hasAny: Boolean(lib.daily_plan) || lib.contents.length > 0,
    setDailyPlan,
    addContent,
    markSynced,
    pendingCodes,
    clear,
  };
}

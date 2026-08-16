'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { toNumber } from './format';

/** 愿望单条目（存储格式按需求约定） */
export interface WishlistItem {
  sub_unit_id: string;
  name: string;
  price: number;
  payment_url: string | null;
  quantity: number;
}

const STORAGE_KEY = 'apple-store.wishlist.v1';
const EMPTY: WishlistItem[] = [];

/* ----------------------------------------------------------
   极简外部 store：localStorage 持久化 + 订阅通知。
   不引入 Zustand，减少依赖；API 语义与其一致，后续可平滑替换。
   ---------------------------------------------------------- */
let items: WishlistItem[] | null = null; // null = 尚未从 localStorage 载入
const listeners = new Set<() => void>();

function isValidItem(v: unknown): v is WishlistItem {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.sub_unit_id === 'string' && typeof o.name === 'string';
}

function load(): WishlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isValidItem)
      .map((it) => ({
        sub_unit_id: it.sub_unit_id,
        name: it.name,
        price: toNumber(it.price),
        payment_url: typeof it.payment_url === 'string' ? it.payment_url : null,
        quantity: Math.max(1, Math.round(toNumber(it.quantity, 1))),
      }));
  } catch {
    return [];
  }
}

function ensure(): WishlistItem[] {
  if (items === null) {
    items = typeof window === 'undefined' ? EMPTY : load();
  }
  return items;
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

function setItems(next: WishlistItem[]) {
  items = next;
  persist();
  emit();
}

export interface WishlistSubInput {
  id: string;
  name: string;
  price: number | string;
  payment_url: string | null;
}

export const wishlistStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): WishlistItem[] {
    return ensure();
  },

  has(subUnitId: string): boolean {
    return ensure().some((i) => i.sub_unit_id === subUnitId);
  },

  count(): number {
    return ensure().length;
  },

  /** 切换收藏状态。返回 true 表示「已加入」，false 表示「已移除」 */
  toggle(sub: WishlistSubInput): boolean {
    const current = ensure();
    const exists = current.some((i) => i.sub_unit_id === sub.id);
    if (exists) {
      setItems(current.filter((i) => i.sub_unit_id !== sub.id));
      return false;
    }
    setItems([
      ...current,
      {
        sub_unit_id: sub.id,
        name: sub.name,
        price: toNumber(sub.price),
        payment_url: sub.payment_url,
        quantity: 1,
      },
    ]);
    return true;
  },

  remove(subUnitId: string) {
    setItems(ensure().filter((i) => i.sub_unit_id !== subUnitId));
  },

  /** 修改数量：最小 1，最大 99 */
  setQuantity(subUnitId: string, quantity: number) {
    const q = Math.max(1, Math.min(99, Math.round(toNumber(quantity, 1))));
    setItems(
      ensure().map((i) =>
        i.sub_unit_id === subUnitId ? { ...i, quantity: q } : i,
      ),
    );
  },

  clear() {
    setItems([]);
  },
};

/* 跨标签页同步：其他页面改动愿望单时本页面角标同步刷新 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      items = null; // 下次 getSnapshot 时重新读取
      emit();
    }
  });
}

/** React Hook：在组件中订阅愿望单 */
export function useWishlist() {
  const list = useSyncExternalStore(
    wishlistStore.subscribe,
    wishlistStore.getSnapshot,
    () => EMPTY, // 服务端快照：SSR 阶段一律空列表，避免水合不一致
  );

  const has = useCallback(
    (subUnitId: string) => list.some((i) => i.sub_unit_id === subUnitId),
    [list],
  );
  const toggle = useCallback((sub: WishlistSubInput) => wishlistStore.toggle(sub), []);
  const remove = useCallback((id: string) => wishlistStore.remove(id), []);
  const setQuantity = useCallback(
    (id: string, quantity: number) => wishlistStore.setQuantity(id, quantity),
    [],
  );
  const clear = useCallback(() => wishlistStore.clear(), []);

  return { items: list, count: list.length, has, toggle, remove, setQuantity, clear };
}

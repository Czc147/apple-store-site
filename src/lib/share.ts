'use client';

/**
 * 共享交换 · 客户端取数（'use client' 组件使用）。
 */

export type ShareStatus = 'pending' | 'approved' | 'rejected' | 'canceled';

export interface ShareExchange {
  id: string;
  status: ShareStatus;
  resource_kind: 'link' | 'image';
  /** 通过前恒为 null（接口层就不返回，见迁移 028） */
  resource_url: string | null;
  resource_note: string | null;
  ref_image_url: string;
  wanted: { id: string; name: string };
  review_note: string | null;
  handled_at: string | null;
  created_at: string;
}

export const SHARE_STATUS_LABEL: Record<ShareStatus, string> = {
  pending: '等官方处理',
  approved: '已通过',
  rejected: '未通过',
  canceled: '已撤回',
};

type Headers = () => Promise<Record<string, string>>;

export async function fetchShareExchanges(
  getAuthHeaders: Headers,
): Promise<ShareExchange[] | null> {
  try {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) return null;
    const res = await fetch('/api/share-exchanges', { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { items: ShareExchange[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return null;
  }
}

export interface CreateShareInput {
  resource_kind: 'link' | 'image';
  resource_url: string;
  resource_note: string;
  ref_image_url: string;
  wanted_sub_unit_id: string;
}

export async function createShareExchange(
  getAuthHeaders: Headers,
  input: CreateShareInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/share-exchanges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? '提交失败' };
    return { ok: true };
  } catch {
    return { ok: false, error: '网络异常，请稍后再试' };
  }
}

export async function cancelShareExchange(
  getAuthHeaders: Headers,
  id: string,
): Promise<boolean> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/share-exchanges/${id}`, {
      method: 'DELETE',
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 可选的大单元（两级选择的第一级） */
export interface PickableMajorUnit {
  id: string;
  name: string;
}

/** 可选的小单元（两级选择的第二级） */
export interface PickableSubUnit {
  id: string;
  name: string;
  price: number | null;
}

/** 从接口返回里取出数组（有的路由直接返数组，有的包一层 items） */
function toList(data: unknown): Array<Record<string, unknown>> {
  return Array.isArray(data)
    ? (data as Array<Record<string, unknown>>)
    : ((data as { items?: Array<Record<string, unknown>> }).items ?? []);
}

export async function fetchPickableMajorUnits(): Promise<PickableMajorUnit[]> {
  try {
    const res = await fetch('/api/major-units');
    if (!res.ok) return [];
    return toList(await res.json()).map((m) => ({
      id: String(m.id),
      name: String(m.name ?? '未命名'),
    }));
  } catch {
    return [];
  }
}

/**
 * 小单元列表。
 * **按大单元过滤**：小单元多起来之后，一个平铺的下拉里会有几十上百项，
 * 根本找不到要选哪个（用户需求 #9：先选大单元再选小单元）。
 */
export async function fetchPickableSubUnits(
  majorUnitId?: string,
): Promise<PickableSubUnit[]> {
  try {
    const url = majorUnitId
      ? `/api/sub-units?major_unit_id=${encodeURIComponent(majorUnitId)}`
      : '/api/sub-units';
    const res = await fetch(url);
    if (!res.ok) return [];
    return toList(await res.json()).map((s) => ({
      id: String(s.id),
      name: String(s.name ?? '未命名'),
      price: s.price === null || s.price === undefined ? null : Number(s.price),
    }));
  } catch {
    return [];
  }
}

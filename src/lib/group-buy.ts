'use client';

/**
 * 一起买（拼单）· 客户端取数。
 */

export type GroupBuyStatus = 'open' | 'full' | 'closed' | 'expired';

export interface GroupBuyMember {
  name: string;
  /** 是否已推送订单 */
  pushed: boolean;
  /** 是不是我自己 —— 判断"我推过没"只能看这个，不能看"有没有人推过" */
  is_me: boolean;
}

export interface GroupBuy {
  id: string;
  status: GroupBuyStatus;
  target_count: number;
  member_count: number;
  /** 每人应付（服务端现算：原价 ÷ 人数） */
  per_price: number;
  unit_price: number;
  product: { id: string; name: string; cover_url: string | null };
  initiator_name: string;
  members: GroupBuyMember[];
  is_member: boolean;
  is_initiator: boolean;
  expires_at: string;
  created_at: string;
}

export const GROUP_BUY_STATUS_LABEL: Record<GroupBuyStatus, string> = {
  open: '等人加入',
  full: '已成团',
  closed: '已关闭',
  expired: '已过期',
};

type Headers = () => Promise<Record<string, string>>;

export async function fetchGroupBuys(
  getAuthHeaders: Headers,
): Promise<GroupBuy[] | null> {
  try {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) return null;
    const res = await fetch('/api/group-buys', { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { items: GroupBuy[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return null;
  }
}

export async function createGroupBuy(
  getAuthHeaders: Headers,
  subUnitId: string,
  targetCount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/group-buys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ sub_unit_id: subUnitId, target_count: targetCount }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? '发起失败' };
    return { ok: true };
  } catch {
    return { ok: false, error: '网络异常，请稍后再试' };
  }
}

export async function joinGroupBuy(
  getAuthHeaders: Headers,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/group-buys/${id}`, { method: 'POST', headers });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? '加入失败' };
    return { ok: true };
  } catch {
    return { ok: false, error: '网络异常，请稍后再试' };
  }
}

export async function leaveGroupBuy(
  getAuthHeaders: Headers,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/group-buys/${id}`, { method: 'DELETE', headers });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? '退出失败' };
    return { ok: true };
  } catch {
    return { ok: false, error: '网络异常，请稍后再试' };
  }
}

/**
 * 成团后按分摊价推送订单。
 * **不传金额** —— 服务端按 group_buy_id 现算分摊价（见 /api/orders），
 * 客户端传价会被忽略，也传不了。
 */
export interface PushResult {
  order_no: string;
  total: number;
  payable: number;
}

export async function pushGroupBuyOrder(
  getAuthHeaders: Headers,
  groupBuyId: string,
  subUnitId: string,
  paymentMethod: 'wechat' | 'alipay',
): Promise<{ ok: true; data: PushResult } | { ok: false; error: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        items: [{ ref_type: 'sub_unit', ref_id: subUnitId, quantity: 1 }],
        payment_method: paymentMethod,
        group_buy_id: groupBuyId,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as PushResult & { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? '推送失败' };
    return { ok: true, data };
  } catch {
    return { ok: false, error: '网络异常，请稍后再试' };
  }
}

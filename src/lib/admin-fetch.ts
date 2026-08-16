/**
 * 后台管理端 fetch 封装：
 * 任何接口返回 401（未登录 / 会话过期）时自动跳回登录页。
 * 仅在 'use client' 的后台组件中使用。
 */
export async function adminFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.href = '/admin/login';
    }
    throw new Error('未登录或登录已过期');
  }
  return res;
}

/** 读取错误响应中的 error 字段，兜底为 HTTP 状态描述 */
export async function extractError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string' && data.error) return data.error;
  } catch {
    /* 非 JSON 响应忽略 */
  }
  return `请求失败（HTTP ${res.status}）`;
}

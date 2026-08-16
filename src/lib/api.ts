import { NextResponse } from 'next/server';

/** 统一 JSON 成功响应 */
export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** 统一 JSON 错误响应 */
export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** 安全解析 JSON 请求体，失败返回 null */
export async function parseBody(
  req: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** sort_order 归一化：只接受 number，否则默认 0 */
export function toSortOrder(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** 字符串或 null 归一化 */
export function toNullableText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

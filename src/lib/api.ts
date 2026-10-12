import { NextResponse } from 'next/server';
import { normalizeMediaUrlsDeep, rewriteMediaUrlsInJson } from './media-url';

/**
 * 统一 JSON 成功响应。
 *
 * 出参统一改写媒体链接：`*.supabase.co` 在大陆被 GFW 直接 RST，浏览器直连的
 * 收款码 / 商品图 / 头像 / 签名视频全部加载失败（数据不受影响，因为 DB 读写
 * 都走服务端同源路由）。所以对外一律发同源 `/api/media` 代理链接，
 * 双向口径与缘由见 lib/media-url.ts。
 *
 * 这里是所有 API 响应的唯一收口点：改这一处即覆盖全站，
 * **包括库里早已存好的旧绝对直链**，前端组件无需任何改动。
 */
export function ok(data: unknown, status = 200) {
  const json = rewriteMediaUrlsInJson(JSON.stringify(data ?? null));
  return new NextResponse(json, {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** 统一 JSON 错误响应 */
export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * 安全解析 JSON 请求体，失败返回 null。
 *
 * 入参统一还原媒体链接（与 ok() 的出参改写成对）：客户端拿到的是同源代理链，
 * 后台表单原样回传，这里先还原成 Supabase 绝对直链再交给业务，
 * 保证入库口径唯一——否则「只能使用本站上传的图片」这类按 host 比对的校验
 * （community / share-exchanges / profile 头像）会把自家图片误判为外链拒掉。
 */
export async function parseBody(
  req: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? normalizeMediaUrlsDeep(body as Record<string, unknown>)
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

/** 字符串数组归一化：过滤非空字符串（用于 uuid[] / id 列表字段） */
export function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
}

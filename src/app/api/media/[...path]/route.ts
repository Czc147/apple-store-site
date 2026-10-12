import type { NextRequest } from 'next/server';
import { fail } from '@/lib/api';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/media/object/public/<bucket>/<key> — 公开桶直链（images / avatars）
 * GET /api/media/object/sign/<bucket>/<key>?token=<jwt> — 私有桶签名链（daily）
 *
 * 存在理由：`*.supabase.co` 在大陆被 GFW 直接 RST，浏览器直连的收款码 /
 * 商品图 / 头像 / 签名视频全部加载失败，而数据没事（DB 读写都走服务端 `/api/*`）。
 * 本路由把 Storage 收进同源，由服务端回源后**流式转发**，与既有的
 * `/api/supabase/auth/[...path]`（认证同源代理）是同一套思路。
 *
 * 链接改写发生在 `lib/api.ts` 的 `ok()` 里（出参统一改写、入参统一还原），
 * 因此库里仍然存 Supabase 绝对直链，前端拿到的永远是同源代理链。
 */

/** 允许代理的公开桶（与 schema.sql / 迁移 018 的 public=true 桶一致） */
const PUBLIC_BUCKETS = new Set(['images', 'avatars']);

/** 允许代理的私有桶（迁移 005，只走签名链；token 本身就是凭证） */
const SIGNED_BUCKETS = new Set(['daily']);

/**
 * 单 IP 每分钟回源上限。刻意给得很宽：广场/我的库一屏就能有几十张图，
 * 限太死会把「图裂」这个原始故障又造回来。仅用于抬高批量盗链成本，
 * 与 lib/rate-limit.ts 一样是单实例尽力而为，不构成严格分布式限流承诺。
 */
const RATE_LIMIT_PER_MIN = 1200;

/** 需要透传的请求头：Range 让视频/音频可拖动，其余两个是缓存协商必需 */
const FORWARD_REQUEST_HEADERS = ['range', 'if-none-match', 'if-modified-since'];

/**
 * 需要透传的响应头（白名单，不用黑名单）。
 * `content-length` / `content-encoding` / `transfer-encoding` 由 undici 解包后
 * 与实际流不再一致，转发会让浏览器判定响应截断，必须丢弃；
 * `content-range` 要保留，否则 206 分段响应不成立。
 */
const FORWARD_RESPONSE_HEADERS = [
  'content-type',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
  'content-disposition',
];

/**
 * 上游没给 cache-control 时的兜底：公开桶 1 小时。
 * 不用 immutable——`avatars` 是固定路径覆盖写（`avatars/{user_id}.jpg`），
 * 永久缓存会让用户换了头像还是看到旧的；正常上传都会带 cacheControl，
 * 走到兜底的概率极低，宁可保守。签名链一律不缓存（token 本身有时效）。
 */
const PUBLIC_FALLBACK_CACHE = 'public, max-age=3600';

/**
 * 合法路径段：非空、不含 / \ 与 NUL。
 *
 * Next 的 [...path] 交出的是**已解码**的段，而正常对象键里的分隔符早就被切成了多段，
 * 所以任何一段里再出现分隔符，只可能是 ..%2f..%2f 这类编码穿越 → 直接拒。
 * 下面重组 URL 时还会逐段 encodeURIComponent，双重保证穿越不成立。
 */
const SAFE_SEGMENT_RE = /^[^/\\\u0000]+$/;

type Ctx = { params: { path: string[] } };

async function proxy(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return fail('SUPABASE_NOT_CONFIGURED', 503);
  if (!rateLimit('media-proxy', getClientIp(req), RATE_LIMIT_PER_MIN, 60_000)) {
    return fail('请求过于频繁，请稍后再试', 429);
  }

  // 路径形如 object/(public|sign)/<bucket>/<...key>；Next 的 [...path] 已解码，
  // 逐段拒掉空段 / 分隔符 / . / ..（见 SAFE_SEGMENT_RE），再 encodeURIComponent 重组。
  const segments = ctx?.params?.path ?? [];
  const [group, kind, bucket] = segments;
  const keySegments = segments.slice(3);
  const shapeOk =
    group === 'object' &&
    keySegments.length > 0 &&
    segments.every((s) => SAFE_SEGMENT_RE.test(s) && s !== '.' && s !== '..');
  const scopeOk =
    (kind === 'public' && PUBLIC_BUCKETS.has(bucket ?? '')) ||
    (kind === 'sign' && SIGNED_BUCKETS.has(bucket ?? ''));
  // 白名单外一律 404（不是 403）：不暴露桶是否存在，也不让本路由变成任意回源代理
  if (!shapeOk || !scopeOk) return fail('无效的媒体请求', 404);

  const target = new URL(
    `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/${segments
      .map((s) => encodeURIComponent(s))
      .join('/')}${req.nextUrl.search}`,
  );
  // 纵深防御：即便上面的拼装被绕过，最终也只允许这两类对象路径出网
  if (!/^\/storage\/v1\/object\/(public|sign)\//.test(target.pathname)) {
    return fail('无效的媒体请求', 404);
  }

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  const method = req.method.toUpperCase() === 'HEAD' ? 'HEAD' : 'GET';
  let upstream: Response;
  try {
    // no-store：路由处理器里的 fetch 会被 App Router 数据缓存接管，
    // 缓存响应体流既没意义也可能吐出陈旧分段；浏览器/CDN 缓存由下面的响应头负责
    upstream = await fetch(target, { method, headers, cache: 'no-store', redirect: 'manual' });
  } catch {
    return fail('媒体回源失败，请稍后再试', 502);
  }

  const responseHeaders = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  const upstreamCache = upstream.headers.get('cache-control');
  if (upstreamCache) responseHeaders.set('cache-control', upstreamCache);
  else if (kind === 'public') responseHeaders.set('cache-control', PUBLIC_FALLBACK_CACHE);
  else responseHeaders.set('cache-control', 'no-store');
  // 同一 URL 可能返回 200（整段）或 206（分段），共享缓存必须按 Range 分别存放
  responseHeaders.append('vary', 'range');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const HEAD = proxy;

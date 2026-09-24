import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { AUTH_PROXY_PREFIX } from '@/lib/supabase/same-origin-fetch';

/**
 * Supabase Auth 同源代理 —— 浏览器不再直连 `*.supabase.co`。
 *
 * ## 为什么需要这个路由
 *
 * 2026-09-24 定位到：站内注册/登录让**浏览器直接** POST
 * `https://<ref>.supabase.co/auth/v1/**`。国内对该域名的阻断是分 Cloudflare 边缘 IP、
 * 分运营商、分时段飘忽的，于是表现为「iPhone 能登录、安卓报 `Failed to fetch`，
 * 开加速器就好」。站内其余数据读写早就由 `/api/*` 服务端代劳，只有 Auth 漏了这一条。
 *
 * 本路由把 `/api/sb/auth/v1/**` 原样转给 Supabase，由 Netlify 函数（在墙外）出网。
 * 客户端侧由 `src/lib/supabase/same-origin-fetch.ts` 改写 URL 接上来。
 *
 * ## 实测出来的硬约束（改动前务必先看，每条都有 2026-09-24 的实测依据）
 *
 * 1. **响应体必须缓冲**，不能流式透传：auth 响应只有几百字节，缓冲后行为确定。
 * 2. **`content-encoding` / `content-length` 绝不能原样转发**：undici 会自动解压响应体，
 *    却**不会删掉响应头里的 `content-encoding`**，也不会修正 `content-length`
 *    （实测：gzip 请求 → 正文解压成明文 610 字节，响应头仍写 `ce=gzip`、`cl=276`）。
 *    照原样转发，浏览器会二次解压失败。所以上游一律要 `identity`，响应侧再兜底剥掉。
 * 3. **状态码原样透传，绝不把 5xx「优化」成 4xx**：auth-js 把 5xx 当可重试错误
 *    （保留会话），把部分 4xx 当终结错误 —— 改错了会让用户被静默登出。
 *    同理 429/400 也必须原样透传，否则会被当成网络错误反复重试。
 * 4. **`failure` 路径必须是 5xx**（见 3），文案走 `msg` 字段：auth-js 取错误文案的顺序是
 *    `msg > message > error_description > error`，放错字段用户就会看到英文。
 */

/** 只放行 Supabase Auth。这个路由不能变成任意境外转发器 */
const ALLOWED_PREFIX = 'auth/v1/';

/** 上游超时：没有它的话上游僵住会把这次调用拖到 Lambda 上限（60s）才释放 */
const UPSTREAM_TIMEOUT_MS = 8000;

/**
 * **只转发这些请求头**（白名单，不是黑名单）。依据实测：
 * 2026-09-24 抓 supabase-js 2.112.3 的真实请求头，只有下面这几个。
 *
 * 为什么不能用黑名单：`x-forwarded-for` 之类的 IP 头**不在** Fetch 的禁止头名单里，
 * 浏览器 JS 可以随便设、同源请求也不触发预检。原样带给 Supabase，就可能被用来
 * 伪造来源 IP、绕过 GoTrue 的按 IP 限流做密码爆破。
 *
 * 逐条说明：
 * - `apikey` / `authorization`：anon key 与会话令牌，凭据本体
 * - `content-type`：JSON 请求体必需
 * - `x-client-info`：supabase-js 的客户端标识
 * - `x-supabase-api-version`：**不能丢** —— auth-js 靠它决定是否解析响应里的 `data.code`
 * - `accept` / `accept-language`：标准头，无副作用
 *
 * 明确**不**转发：`cookie`（同源请求会带上本站自己的 cookie，如后台会话，
 * 绝不能泄露给 Supabase）、`origin` / `referer`（服务端到服务端保持干净）、
 * 以及一切 `x-forwarded-*` / `x-real-ip` / `forwarded`（客户端可伪造）。
 */
const FORWARD_REQUEST_HEADERS = new Set([
  'apikey',
  'authorization',
  'content-type',
  'accept',
  'accept-language',
  'x-client-info',
  'x-supabase-api-version',
]);

/**
 * 不回传给浏览器的响应头。
 * - 逐跳头
 * - `content-length` / `content-encoding`：解压后已失真（见文件头第 2 条）
 * - `etag`：配合下面强制的 `cache-control: no-store`，不给任何一层留缓存复用用户数据的机会
 */
const STRIP_RESPONSE = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'content-encoding',
  'etag',
  // 源站专属头：这些是**supabase.co 的**属性，不该套到本站域名上。
  // `set-cookie` 尤其明显 —— 实测上游会回 Cloudflare 的 `__cf_bm=…; Domain=supabase.co`
  // （浏览器会因域不匹配忽略它，但让上游往本站域名种 cookie 本身就不对）。
  // `strict-transport-security` / `alt-svc` 同属源站作用域。
  'set-cookie',
  'strict-transport-security',
  'alt-svc',
]);

/** 按规范不能带响应体的状态码：塞 body 会让 Response 构造直接抛错（登出返回 204） */
const NULL_BODY_STATUS = new Set([204, 205, 304]);

/** 白名单挑请求头（`append` 保留多值，`set` 会把多值头折叠成最后一条） */
function pickRequestHeaders(src: Headers): Headers {
  const out = new Headers();
  src.forEach((value, key) => {
    const k = key.toLowerCase();
    if (FORWARD_REQUEST_HEADERS.has(k)) out.append(k, value);
  });
  return out;
}

/** 剥掉不该回传的响应头，其余原样保留多值 */
function filterResponseHeaders(src: Headers): Headers {
  const out = new Headers();
  src.forEach((value, key) => {
    const k = key.toLowerCase();
    if (!STRIP_RESPONSE.has(k)) out.append(k, value);
  });
  return out;
}

/**
 * 3xx 的 `location` 若指回 Supabase，改写成同源。
 * 不改的话浏览器拿到 303 会直接去连 `*.supabase.co` —— 正是要绕开的那一跳。
 */
function rewriteLocation(headers: Headers, base: string): void {
  const loc = headers.get('location');
  if (!loc) return;
  if (loc !== base && !loc.startsWith(`${base}/`)) return;
  headers.set('location', `${AUTH_PROXY_PREFIX}${loc.slice(base.length)}`);
}

function supabaseBaseUrl(): string | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  return url ? url.replace(/\/+$/, '') : null;
}

/** 服务端（函数）看到的客户端 IP：优先 Netlify 注入的可信头，退到 XFF 的最后一段 */
function probeClientIp(req: NextRequest): string {
  const trustNetlify = req.headers.get('x-nf-client-connection-ip');
  if (trustNetlify) return trustNetlify;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',').pop()?.trim() || 'unknown';
  return 'unknown';
}

/** 只读健康探针：`GET /api/sb` —— 手机上打开即可确认「本站服务端能不能到 Supabase」 */
async function healthProbe() {
  const base = supabaseBaseUrl();
  if (!base) {
    return NextResponse.json({ ok: false, note: '服务端未配置 SUPABASE_URL' }, { status: 503 });
  }

  const anonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  try {
    const res = await fetch(`${base}/auth/v1/settings`, {
      headers: {
        ...(anonKey ? { apikey: anonKey } : {}),
        'accept-encoding': 'identity',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    // 只回状态码与结论：不回传任何 key，也不回上游错误细节
    return NextResponse.json({
      ok: res.ok,
      upstream_status: res.status,
      note: res.ok
        ? '本站服务端到 Supabase 通畅'
        : '有响应但非 200 —— 多半是 anon key 没配或不对',
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        upstream_status: 0,
        note: '本站服务端连不上 Supabase —— 属于服务端出网问题，与手机网络无关',
      },
      { status: 502 },
    );
  }
}

/** 把一次请求原样转给 Supabase Auth */
async function relay(req: NextRequest, segments: string[]) {
  const base = supabaseBaseUrl();
  if (!base) {
    return NextResponse.json(
      { msg: '服务端未配置 SUPABASE_URL，登录暂不可用', error: 'SUPABASE_NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  const path = segments.join('/');
  if (
    !path.startsWith(ALLOWED_PREFIX) ||
    segments.some((s) => s === '.' || s === '..' || s.includes('..'))
  ) {
    return NextResponse.json(
      { msg: '不支持的路径', error: 'NOT_FOUND' },
      { status: 404 },
    );
  }

  // 减速带（不是安全控制：anon key 本来就是公开的）：supabase-js 每个请求都至少带一个
  if (!req.headers.get('apikey') && !req.headers.get('authorization')) {
    return NextResponse.json(
      { msg: '请求缺少必要的凭据头', error: 'MISSING_API_KEY' },
      { status: 401 },
    );
  }

  const target = `${base}/${path}${req.nextUrl.search}`;
  const method = req.method.toUpperCase();
  const headers = pickRequestHeaders(req.headers);
  // 见文件头第 2 条：undici 解压后响应头会失真，所以干脆不要压缩
  headers.set('accept-encoding', 'identity');

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : await req.arrayBuffer(),
      // 3xx 原样拿回来（undici 的 manual 会返回真实 3xx + 可读 location，不是 opaqueredirect）
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    // 只记 pathname：query 上可能挂着一次性凭据（如 `?token_hash=…`），不能进日志
    console.error('[api/sb] 上游不可达:', req.nextUrl.pathname, err);
    // 5xx = auth-js 眼里的可重试错误（保留会话），不要改成 4xx
    return NextResponse.json(
      { msg: '登录服务暂时不可用，请稍后重试', error: 'UPSTREAM_UNREACHABLE' },
      { status: 502 },
    );
  }

  const responseHeaders = filterResponseHeaders(upstream.headers);
  // `GET /auth/v1/user` 返回的是用户数据，不许任何一层缓存
  responseHeaders.set('cache-control', 'no-store');
  if (upstream.status >= 300 && upstream.status < 400) rewriteLocation(responseHeaders, base);

  const body = await upstream.arrayBuffer();
  return new NextResponse(NULL_BODY_STATUS.has(upstream.status) ? null : body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const dynamic = 'force-dynamic';
// 显式钉死 Node 运行时：Edge 下 `process.env` 读法不同，会被静默当成「没配」而全程 503
export const runtime = 'nodejs';

type RouteContext = { params: { path?: string[] } };

/** GET：零段 → 健康探针；其余（如 `/auth/v1/user`）走代理 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const segments = ctx.params.path ?? [];
  if (segments.length === 0) {
    // 探针会真的打一次上游，不拦的话谁都能刷着烧函数调用量（内存限流是尽力而为，见 lib/rate-limit.ts）
    if (!rateLimit('sb-probe', probeClientIp(req), 10, 60_000)) {
      return NextResponse.json({ ok: false, note: '请求过于频繁，请稍后再试' }, { status: 429 });
    }
    return healthProbe();
  }
  return relay(req, segments);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return relay(req, ctx.params.path ?? []);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  return relay(req, ctx.params.path ?? []);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return relay(req, ctx.params.path ?? []);
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return relay(req, ctx.params.path ?? []);
}

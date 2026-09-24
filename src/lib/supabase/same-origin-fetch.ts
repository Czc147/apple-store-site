/**
 * 同源改写 fetch —— 让浏览器永远不直接连 `*.supabase.co`。
 *
 * ## 为什么需要
 *
 * 国内网络对 `*.supabase.co` 的阻断**不是稳定的**：按 Cloudflare 边缘 IP、按运营商、
 * 按时段飘忽（同一台机器今天通、明天被 SNI 重置；同一时刻这台通、那台不通）。
 * 前端只要还有「浏览器直发 supabase.co」的代码，安卓用户的注册/登录就会随机失败，
 * 且错误表现为一句红色英文（Chrome 是 `Failed to fetch`、Safari 是 `Load failed`），
 * 用户完全无从判断是自己密码错了还是网络被拦了。
 *
 * 2026-09-24 实测：站内注册/登录链路上**只有** Supabase Auth 还在直连境外
 * （其余数据读写早就走 `/api/*` 由服务端代劳），所以只改这一处即可。
 *
 * ## 做法
 *
 * 把 `https://<ref>.supabase.co/auth/v1/**` 的请求改写成同源的
 * `/api/sb/auth/v1/**`，由 Netlify 函数（在墙外）转给 Supabase。
 * 浏览器只跟本站域名说话，与设备、DNS、运营商、IP 全部无关。
 *
 * ## 为什么要自定义 fetch
 *
 * `createClient(url, key, { global: { fetch } })` 会被 supabase-js 用在**每一条**
 * auth 请求上（GoTrueClient 里所有网络调用都走 `this.fetch`，无一处裸 fetch）。
 * 已实测覆盖面（2026-09-24，拦截计 URL）：登录 / 注册 / 找回密码 / 设置新密码 /
 * 改密码 / 取用户 / 续期（`grant_type=refresh_token`）/ 登出，**全部命中，零漏网**。
 * 相比把整个会话改成 httpOnly cookie，这个改法**不动会话语义**（token 仍由
 * supabase-js 存在 localStorage），爆炸半径最小。
 *
 * ⚠️ 已知覆盖不到的一处：`supabaseBrowser().channel()` 走 WebSocket，不经过 fetch。
 *    当前没有代码这么用；将来若要用 Realtime，得单独处理。
 */

/** 站内代理前缀（与 src/app/api/sb/[[...path]]/route.ts 对应） */
export const AUTH_PROXY_PREFIX = '/api/sb';

/**
 * 从 fetch 的第一个参数里取出绝对 URL。
 * 用鸭子类型而不是 `instanceof Request`：跨 realm（iframe 等）时 instanceof 会失效。
 */
function hrefOf(input: unknown): string | null {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (
    input !== null &&
    typeof input === 'object' &&
    'url' in input &&
    typeof (input as { url: unknown }).url === 'string'
  ) {
    return (input as { url: string }).url;
  }
  return null;
}

/**
 * 造一个只改写 Supabase Auth 的 fetch。
 *
 * @param supabaseOrigin 形如 `https://xxxx.supabase.co`，来自 NEXT_PUBLIC_SUPABASE_URL
 * @param baseUrl        前缀（浏览器留空即可走相对地址；Node 端自测可传 http://localhost:3000）
 * @param fallback       非 auth 请求的兜底 fetch
 */
export function makeSameOriginAuthFetch(
  supabaseOrigin: string,
  baseUrl = '',
  fallback: typeof fetch = globalThis.fetch.bind(globalThis),
): typeof fetch {
  const origin = supabaseOrigin.replace(/\/+$/, '');
  const authPrefix = `${origin}/auth/v1/`;
  const warn = (msg: string) => console.warn(`[supabase] ${msg}`);

  const rewritten: typeof fetch = async (input, init) => {
    const href = hrefOf(input);
    if (!href) return fallback(input, init);

    // 用 origin 比较，不用字符串前缀 —— 否则 `https://<ref>.supabase.co.evil.com/…`
    // 会被误当成自己人改写；相对地址（浏览器允许）在这里解析失败，直接放行即可
    let isSupabase = false;
    try {
      isSupabase = new URL(href).origin === origin;
    } catch {
      return fallback(input, init);
    }
    if (!isSupabase) return fallback(input, init);

    // Supabase 的**非 auth** 请求：放行但报警。
    // 这是「将来有人新增了浏览器直连 Supabase 的代码」的哨兵 —— 那类代码在国内会
    // 随机失败，必须改成走 /api/*。只警告不改行为，避免当场把功能弄坏。
    if (!href.startsWith(authPrefix)) {
      warn(
        `检测到浏览器直连 Supabase 的非 auth 请求（国内会随机失败，应改走服务端）：${href}`,
      );
      return fallback(input, init);
    }

    const local = `${baseUrl}${AUTH_PROXY_PREFIX}${href.slice(origin.length)}`;
    if (input instanceof Request) {
      try {
        return fallback(new Request(local, input));
      } catch {
        // 相对地址在 Node 下构造 Request 会抛（浏览器不会）；退回字符串形式
        return fallback(local);
      }
    }
    return fallback(local, init);
  };

  return rewritten;
}

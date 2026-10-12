/**
 * Supabase Storage 同源媒体代理 —— URL 改写工具
 *
 * 为什么需要它：`*.supabase.co` 在大陆被 GFW 直接 RST（TLS 握手阶段就断），
 * 浏览器直连的收款码 / 商品图 / 头像 / 签名视频**全部加载失败**；
 * 而数据一切正常——因为所有 DB 读写都走服务端 `/api/*` 同源路由。
 * 认证侧早就用同源代理解决了同一类问题（`/api/supabase/auth/[...path]`），
 * 存储侧在这里补齐：对浏览器一律发同源 `/api/media/...`，
 * 由服务端回源 Supabase Storage 后流式转发（见 `app/api/media/[...path]/route.ts`）。
 *
 * 两个方向必须成对使用，否则库里会同时存在两种写法：
 * - **出（读）** `toMediaUrl` / `rewriteMediaUrlsInJson`：绝对直链 → 同源代理链
 * - **入（写）** `fromMediaUrl` / `normalizeMediaUrlsDeep`：同源代理链 → 绝对直链
 *   入库统一存绝对链，因为「校验图片确实来自本站」（community / share-exchanges /
 *   profile 头像）与孤儿文件清理都是按绝对链口径比对的。
 */

/** 同源媒体代理前缀（对应 `app/api/media/[...path]/route.ts`） */
export const MEDIA_PROXY_PREFIX = '/api/media';

/** 代理前缀下的对象路径前缀：`/api/media/object/...` */
const MEDIA_OBJECT_PREFIX = `${MEDIA_PROXY_PREFIX}/object/`;

/**
 * Supabase Storage 绝对直链的识别标记。
 * 先做一次廉价的 `includes` 预筛，避免为每个响应都跑正则。
 */
const SUPABASE_ORIGIN_MARKER = '.supabase.co/storage/v1/object/';

/**
 * 可被浏览器直接消费的两类对象链接：
 * `public` = 公开桶直链（images / avatars），`sign` = 私有桶签名链（daily）。
 * 只匹配这两种，管理接口（bucket 列表等）不会被误改写。
 */
const SUPABASE_OBJECT_URL_RE =
  /https?:\/\/[^"'\s\\/]+\.supabase\.co\/storage\/v1\/(object\/(?:public|sign)\/)/gi;

/**
 * 是否是走本站代理的媒体链接（同源相对路径）。
 *
 * 刻意不写成类型守卫（url is string）：调用方传进来的往往已经是 string，
 * 守卫会把否定分支收窄成 never，导致后面的 .includes / .replace 报 TS2339。
 */
export function isMediaProxyUrl(url: unknown): boolean {
  return typeof url === 'string' && url.startsWith(MEDIA_OBJECT_PREFIX);
}

/**
 * 单条 URL 改写：Supabase 存储绝对链 → 同源 `/api/media` 代理链。
 * 非本站存储链接（站外图 / picsum 演示图 / 已是代理链）原样返回。
 */
export function toMediaUrl(url: string): string {
  if (!url || isMediaProxyUrl(url) || !url.includes(SUPABASE_ORIGIN_MARKER)) return url;
  return url.replace(SUPABASE_OBJECT_URL_RE, `${MEDIA_PROXY_PREFIX}/$1`);
}

/**
 * 序列化后的 JSON 文本批量改写（`ok()` 的唯一收口点，覆盖所有 API 响应）。
 *
 * 走字符串层而不是深度遍历对象树：一遍扫完、不重建对象、不改变任何非 URL 字段。
 * 安全性：JSON 字符串内的 URL 不含需要转义的字符（无引号 / 反斜杠 / 控制符），
 * 直接替换不会破坏 JSON 结构；签名链的 `token` 是 JWT，字符集同样安全。
 */
export function rewriteMediaUrlsInJson(json: string): string {
  if (!json.includes(SUPABASE_ORIGIN_MARKER)) return json;
  return json.replace(SUPABASE_OBJECT_URL_RE, `${MEDIA_PROXY_PREFIX}/$1`);
}

/** 服务端：Supabase 站点根（无尾斜杠）；未配置时返回空串 */
function supabaseOrigin(): string {
  const raw = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return raw.replace(/\/+$/, '');
}

/**
 * 反向还原：同源代理链 → Supabase 存储绝对直链。
 * 未配置 SUPABASE_URL（演示模式）时原样返回——演示模式不入库，口径无所谓。
 */
export function fromMediaUrl(url: string): string {
  if (!isMediaProxyUrl(url)) return url;
  const origin = supabaseOrigin();
  if (!origin) return url;
  return `${origin}/storage/v1/${url.slice(MEDIA_PROXY_PREFIX.length + 1)}`;
}

/**
 * 深度归一化请求体：把客户端回传的同源代理链还原成绝对直链再入库。
 *
 * 必要性：客户端拿到的读响应已被改写成代理链，后台表单原样回传时若不还原，
 * 库里就会混进 `/api/media/...` 相对链——「只能使用本站上传的图片」这类
 * 按 host 比对的校验会直接把它拒掉。
 * 只处理 `JSON.parse` 的产物（纯对象 / 数组 / 标量），不涉及类实例。
 */
export function normalizeMediaUrlsDeep<T>(value: T): T {
  if (typeof value === 'string') return fromMediaUrl(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => normalizeMediaUrlsDeep(item)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = normalizeMediaUrlsDeep(item);
    }
    return out as T;
  }
  return value;
}

/**
 * 深度改写（出参方向）：Server Component 直查库后把数据塞进 RSC 载荷，
 * 不经过 `ok()`，需要自行改写，否则 SSR 页面里的裸 `<img>` 仍指向被墙的域名。
 */
export function toMediaUrlsDeep<T>(value: T): T {
  if (typeof value === 'string') return toMediaUrl(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => toMediaUrlsDeep(item)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = toMediaUrlsDeep(item);
    }
    return out as T;
  }
  return value;
}

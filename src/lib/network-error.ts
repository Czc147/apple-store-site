/**
 * 网络层失败判定 —— 服务端（Node/undici）与浏览器两侧的文案都要认。
 *
 * 为什么两侧都写：
 * - **服务端**（`/api/*` 里 fetch 失败）抛 `TypeError: fetch failed`，cause.code 为
 *   ECONNRESET / ETIMEDOUT / ENOTFOUND / EAI_AGAIN；
 * - **浏览器**抛的文案各家不同，且**认不出来就等于认不出网络问题**：
 *   Chrome/安卓是 `Failed to fetch`，Safari/iOS 是 `Load failed`，
 *   老 Android WebView 是 `NetworkError when attempting to fetch resource`。
 *   2026-09-24 安卓登录报的红色英文正是 `Failed to fetch` —— 当时这个函数
 *   只认 Node 文案，导致一句网络错误被当成未知错误兜底吐给用户。
 */
const NETWORK_ERROR_PATTERNS = [
  // 服务端（Node/undici）
  'fetch failed',
  'econnreset',
  'etimedout',
  'enotfound',
  'eai_again',
  // 浏览器
  'failed to fetch', // Chrome / 安卓
  'load failed', // Safari / iOS
  'networkerror', // 老 Android WebView
  'network request failed',
  'err_network_changed',
  'err_internet_disconnected',
  // 超时
  'timeout',
  'timed out',
];

export function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const cause = (error as { cause?: { code?: string } })?.cause?.code ?? '';
  const text = `${message} ${cause}`.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((p) => text.includes(p));
}

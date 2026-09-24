/**
 * 时间解析（无依赖，服务端/客户端都能 import）。
 */

/**
 * 把**无时区**的时间串按**北京时间（UTC+8）**解释成时间戳。
 *
 * ## 为什么需要它
 *
 * 后台的时间控件是 `<input type="datetime-local">`，产出的是**裸串**
 * （`2026-10-01T10:00`，不带任何时区信息）。直接 `Date.parse(裸串)` 会按
 * **运行环境的本地时区**解释 —— 而 Netlify Functions 跑在 UTC、管理员在北京，
 * 于是"北京时间 10:00"被存成了 18:00，**折扣晚 8 小时才生效**（券的时间窗同款问题）。
 * 2026-09-24 修。自建部署换时区也不会再变，因为这里写死了 Asia/Shanghai。
 *
 * ## 行为
 *
 * - 已带时区信息（结尾 `Z` 或 `±hh:mm`）→ 按它自己的时区解释，原样接受。
 *   前端现在提交的就是自描述的 ISO 串，这里主要是兜底（手工调用 / 外部脚本 / 旧数据）。
 * - `YYYY-MM-DDTHH:mm[:ss]` 或 `YYYY-MM-DD HH:mm[:ss]`（可带毫秒）→ 补 `+08:00`。
 * - 其它一律交给 `Date.parse`，解析不出来返回 `NaN`（调用方自己判）。
 *
 * ⚠️ 老数据无法追溯修正：库里存的已经是绝对时刻，无从判断它当初是不是裸串来的。
 * 改了这条之后，请把**当前生效的时间窗重新保存一次**。
 */
export function parseLocalDateTimeCN(v: string): number {
  const s = v.trim();
  if (!s) return NaN;

  // 自描述的串（带 Z 或 ±hh:mm）按它自己解释
  if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(s)) return Date.parse(s);

  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?$/.exec(s);
  if (m) return Date.parse(`${m[1]}T${m[2]}${m[3] ?? ''}+08:00`);

  return Date.parse(s);
}

/**
 * 后台表单里 `<input type="datetime-local">` 的值 → 带时区的 ISO 串。
 * 空串 / 非法 → null（表示"不限制"）。
 *
 * 与后台的 `toLocalInput(iso)` **对称**：后者把存的 ISO 转成浏览器本地时间显示，
 * 这里再把用户填的本地时间转回自描述的绝对时刻。所以：
 * - 用 `new Date(v)`（按**浏览器**时区解释）而不是 `parseLocalDateTimeCN`（北京时区）——
 *   这样即使管理员不在东八区，回显与提交也仍然自洽。
 * - 提交后再由服务端存库，wire 上永远自描述，服务端不必猜时区。
 */
export function localInputToIso(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const t = new Date(v);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

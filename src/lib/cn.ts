/**
 * 类名拼接工具：过滤 falsy 后用空格连接。
 * 注意：不做 tailwind-merge 式冲突消解——同一属性互斥的类
 * （如两个不同 px-*）不要同时传，组件 API 用 props 档位代替。
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * 帖子举报理由（客户端选项与 API 校验共用，避免两边枚举对不上）。
 * 顺序即界面展示顺序：把最常见的放前面。
 */
export const REPORT_REASONS = [
  { key: 'spam', label: '垃圾广告' },
  { key: 'abuse', label: '辱骂或骚扰' },
  { key: 'porn', label: '色情低俗' },
  { key: 'illegal', label: '违法或有害信息' },
  { key: 'other', label: '其他' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['key'];

export const REPORT_REASON_KEYS: string[] = REPORT_REASONS.map((r) => r.key);

/** key → 中文标签（后台列表展示用；未知 key 原样返回，便于排查历史数据） */
export function reportReasonLabel(key: string): string {
  return REPORT_REASONS.find((r) => r.key === key)?.label ?? key;
}

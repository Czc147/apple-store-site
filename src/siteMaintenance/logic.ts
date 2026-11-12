export interface MaintenanceConfig {
  enabled: boolean;
  /** Absolute ISO timestamp. Estimated only: never controls enabled. */
  deadline: string | null;
  title: string;
  description: string;
}

export const MAINTENANCE_KEY = 'site_maintenance';
export const DEFAULT_MAINTENANCE: MaintenanceConfig = {
  enabled: false,
  deadline: null,
  title: 'Zorvin 暂时维护中',
  description: '网站正在更新维护，暂时无法访问。感谢你的耐心等待。',
};

export function parseMaintenance(input: unknown): MaintenanceConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('维护配置格式不正确');
  const value = input as Record<string, unknown>;
  if (typeof value.enabled !== 'boolean') throw new Error('请选择是否关闭网站');
  const text = (key: 'title' | 'description', max: number) => {
    if (typeof value[key] !== 'string' || value[key].length > max) throw new Error(`${key === 'title' ? '标题' : '说明'}格式或长度不正确`);
    return value[key].trim() || DEFAULT_MAINTENANCE[key];
  };
  let deadline: string | null = null;
  if (value.deadline !== null && value.deadline !== '') {
    if (typeof value.deadline !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value.deadline) || !Number.isFinite(Date.parse(value.deadline))) throw new Error('预计恢复时间必须包含有效时区');
    deadline = new Date(value.deadline).toISOString();
  }
  return { enabled: value.enabled, deadline, title: text('title', 80), description: text('description', 500) };
}

export function getTimeLeft(deadlineMs: number, nowMs: number) {
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) return null;
  const seconds = Math.max(0, Math.floor((deadlineMs - nowMs) / 1000));
  return { days: Math.floor(seconds / 86400), hours: Math.floor((seconds % 86400) / 3600), minutes: Math.floor((seconds % 3600) / 60), seconds: seconds % 60 };
}

export function bypassMaintenance(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/') ||
    ['/api/auth/login', '/api/auth/logout', '/api/maintenance', '/maintenance', '/favicon.ico', '/icon.svg', '/apple-icon.png', '/robots.txt'].includes(path) ||
    path.startsWith('/_next/static/') || path.startsWith('/_next/image');
}

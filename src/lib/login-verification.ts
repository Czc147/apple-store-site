import { createHash, randomInt } from 'node:crypto';
import type { NextRequest } from 'next/server';

export type LoginDeviceType = 'ios' | 'android' | 'windows' | 'macos' | 'other';

const DEVICE_LABEL: Record<LoginDeviceType, string> = {
  ios: 'iOS',
  android: 'Android',
  windows: 'Windows',
  macos: 'macOS',
  other: '其他设备',
};

const REGION_ALIASES: Record<string, string> = {
  BJ: '北京',
  SH: '上海',
  TJ: '天津',
  CQ: '重庆',
  HE: '河北',
  SX: '山西',
  NM: '内蒙古',
  LN: '辽宁',
  JL: '吉林',
  HL: '黑龙江',
  JS: '江苏',
  ZJ: '浙江',
  AH: '安徽',
  FJ: '福建',
  JX: '江西',
  SD: '山东',
  HA: '河南',
  HB: '湖北',
  HN: '湖南',
  GD: '广东',
  GX: '广西',
  HNAN: '海南',
  SC: '四川',
  GZ: '贵州',
  YN: '云南',
  XZ: '西藏',
  SN: '陕西',
  GS: '甘肃',
  QH: '青海',
  NX: '宁夏',
  XJ: '新疆',
  HK: '香港',
  MO: '澳门',
  TW: '台湾',
};

export function deviceTypeLabel(value: LoginDeviceType): string {
  return DEVICE_LABEL[value];
}

export function isLoginDeviceType(value: unknown): value is LoginDeviceType {
  return (
    value === 'ios' ||
    value === 'android' ||
    value === 'windows' ||
    value === 'macos' ||
    value === 'other'
  );
}

export function detectLoginDeviceType(userAgent: string | null): LoginDeviceType {
  const value = userAgent?.toLowerCase() ?? '';
  if (value.includes('iphone') || value.includes('ipad') || value.includes('ios')) return 'ios';
  if (value.includes('android')) return 'android';
  if (value.includes('windows')) return 'windows';
  if (value.includes('mac os') || value.includes('macintosh')) return 'macos';
  return 'other';
}

export function hashLoginValue(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export function normalizeRegionInput(value: string): string {
  const raw = value.trim().replace(/\s+/g, '');
  if (!raw) return '';

  const compound = raw.includes('-') ? raw.split('-').pop() ?? '' : raw;
  const upper = compound.toUpperCase();
  if (REGION_ALIASES[upper]) return REGION_ALIASES[upper];
  if (/^CN$/i.test(raw)) return '中国';
  if (/^HK$/i.test(raw)) return '香港';
  if (/^MO$/i.test(raw)) return '澳门';
  if (/^TW$/i.test(raw)) return '台湾';
  return raw;
}

export function detectLoginRegion(req: NextRequest): string {
  const raw =
    req.headers.get('x-nf-geo-region') ??
    req.headers.get('x-nf-geo-country') ??
    req.headers.get('cf-ipcountry') ??
    req.headers.get('x-vercel-ip-country') ??
    req.headers.get('x-country') ??
    '未知';
  return normalizeRegionInput(raw) || '未知';
}

export function regionsMatch(stored: string, input: string): boolean {
  const left = normalizeRegionInput(stored);
  const right = normalizeRegionInput(input);
  if (!left || !right || left === '未知' || right === '未知') return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function generateTemporaryPassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let password = '';
  for (let index = 0; index < length; index += 1) {
    password += chars[randomInt(chars.length)];
  }
  return password;
}

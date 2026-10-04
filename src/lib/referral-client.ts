'use client';

const STORAGE_KEY = 'zorvin-referral-code';
const CODE_PATTERN = /^[A-Z0-9-]{6,32}$/;
const STORAGE_TTL_MS = 30 * 24 * 3600 * 1000;

interface StoredReferral {
  code: string;
  expiresAt: number;
}

export function normalizeReferralCode(value: string | null | undefined): string | null {
  const code = (value ?? '').trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

export function captureReferralCode(search: string): string | null {
  if (typeof window === 'undefined') return null;
  const code = normalizeReferralCode(new URLSearchParams(search).get('ref'));
  if (!code) return null;
  try {
    const stored: StoredReferral = { code, expiresAt: Date.now() + STORAGE_TTL_MS };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* 隐私模式无法保存时，当次注册仍可通过 URL 参数归因 */
  }
  return code;
}

export function getStoredReferralCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredReferral;
    if (!Number.isFinite(stored.expiresAt) || stored.expiresAt < Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return normalizeReferralCode(stored.code);
  } catch {
    return null;
  }
}

export function clearStoredReferralCode(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

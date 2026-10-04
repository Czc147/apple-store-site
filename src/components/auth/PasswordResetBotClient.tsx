'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Copy, KeyRound, ShieldCheck } from 'lucide-react';
import PremiumOrbi, { type OrbiMood } from '@/components/premium-orbi/PremiumOrbi';
import Surface from '@/components/ui/Surface';

const DEVICE_OPTIONS = [
  { value: 'ios', label: 'iOS' },
  { value: 'android', label: 'Android' },
  { value: 'windows', label: 'Windows' },
  { value: 'macos', label: 'macOS' },
  { value: 'other', label: '其他设备' },
] as const;

interface ResetResult {
  temporary_password: string;
  message: string;
}

export default function PasswordResetBotClient() {
  const [email, setEmail] = useState('');
  const [deviceType, setDeviceType] = useState<(typeof DEVICE_OPTIONS)[number]['value']>('ios');
  const [region, setRegion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ResetResult | null>(null);
  const [copied, setCopied] = useState(false);

  const mood: OrbiMood = busy
    ? 'thinking'
    : error
      ? 'surprised'
      : result
        ? 'happy'
        : 'welcome';

  const submit = async () => {
    if (busy) return;
    setError('');
    setResult(null);
    setCopied(false);

    if (!email.trim() || !region.trim()) {
      setError('请完整输入账号和登录地区');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/auth/password-reset/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), device_type: deviceType, region }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { temporary_password?: string; message?: string; error?: string }
        | null;
      if (!response.ok || !payload?.temporary_password) {
        throw new Error(payload?.error ?? '验证未通过，暂时无法自动重置密码');
      }
      setResult({
        temporary_password: payload.temporary_password,
        message: payload.message ?? '临时密码已生成，下次登录后请立即修改。',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  };

  const copyTemporaryPassword = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.temporary_password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError('复制失败，请手动记录临时密码');
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-md gap-6 px-page py-10">
      <div className="flex flex-col items-center text-center">
        <PremiumOrbi mood={mood} size={148} />
        <h1 className="mt-4 text-[24px] font-semibold tracking-tight text-apple-text">
          客服机器人 · 找回密码
        </h1>
        <p className="mt-2 max-w-[320px] text-[14px] leading-relaxed text-apple-text-2">
          我会核对账号、常用设备类型和登录地区。通过后自动发放临时密码，不发送验证邮件。
        </p>
      </div>

      <Surface radius="card-lg" className="p-6 sm:p-7">
        {result ? (
          <div className="space-y-5 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-apple-blue-soft">
              <ShieldCheck className="h-6 w-6 text-apple-blue" aria-hidden />
            </span>
            <div>
              <p className="text-[18px] font-semibold text-apple-text">验证通过</p>
              <p className="mt-2 text-[14px] leading-relaxed text-apple-text-2">{result.message}</p>
            </div>
            <div className="rounded-2xl border border-apple-border bg-apple-bg p-4">
              <p className="text-[12px] font-medium text-apple-text-3">临时密码</p>
              <p className="mt-2 break-all font-mono text-[20px] font-semibold tracking-wide text-apple-text">
                {result.temporary_password}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyTemporaryPassword()}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-btn bg-apple-text px-5 text-[14px] font-medium text-white transition active:scale-95"
            >
              <Copy className="h-4 w-4" aria-hidden />
              {copied ? '已复制' : '复制临时密码'}
            </button>
            <Link
              href="/login?mode=login"
              className="inline-flex h-10 items-center justify-center rounded-btn border border-apple-border bg-white px-5 text-[14px] font-medium text-apple-text transition active:scale-95"
            >
              去登录并修改密码
            </Link>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-apple-text">
                注册邮箱 / 账号
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="输入注册邮箱"
                autoComplete="email"
                disabled={busy}
                className="h-11 w-full rounded-xl border border-apple-border bg-white px-3 text-[14px] text-apple-text outline-none transition focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-apple-text">
                常用设备类型
              </span>
              <select
                value={deviceType}
                onChange={(event) => setDeviceType(event.target.value as typeof deviceType)}
                disabled={busy}
                className="h-11 w-full rounded-xl border border-apple-border bg-white px-3 text-[14px] text-apple-text outline-none transition focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20"
              >
                {DEVICE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-apple-text">
                常用登录地区
              </span>
              <input
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                placeholder="例如：广东 / 上海 / 华东"
                disabled={busy}
                className="h-11 w-full rounded-xl border border-apple-border bg-white px-3 text-[14px] text-apple-text outline-none transition focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20"
              />
              <span className="mt-1 block text-[12px] leading-relaxed text-apple-text-3">
                只需填写省级 / 直辖市 / 大区，不需要精确城市。
              </span>
            </label>

            {error && (
              <p role="alert" className="text-[13px] leading-relaxed text-[#B80012]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-btn bg-apple-blue px-5 text-[14px] font-medium text-white transition active:scale-95 disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" aria-hidden />
              {busy ? '验证中…' : '自动核对并生成临时密码'}
            </button>

            <p className="rounded-xl bg-apple-bg px-3 py-2.5 text-[12px] leading-relaxed text-apple-text-3">
              24 小时内最多尝试 3 次。系统只保存粗略地区和设备类型，不保存精确 IP。
            </p>
          </form>
        )}
      </Surface>

      <div className="text-center">
        <Link href="/login?mode=old-reset" className="text-[13px] font-medium text-apple-blue">
          记得旧密码？直接修改
        </Link>
      </div>
    </div>
  );
}

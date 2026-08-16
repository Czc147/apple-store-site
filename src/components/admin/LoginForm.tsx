'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { inputCls, btnPrimary } from './ui';

/** 管理员密码登录表单 */
export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace('/admin');
        return;
      }
      const data = await res.json().catch(() => null);
      setError(
        typeof data?.error === 'string' && data.error
          ? data.error
          : `登录失败（HTTP ${res.status}）`,
      );
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-apple-bg px-5">
      <div className="w-full max-w-sm rounded-card-lg border border-apple-border bg-apple-card p-8 shadow-card">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-apple-blue-soft">
          <Lock className="h-5 w-5 text-apple-blue" aria-hidden />
        </div>
        <h1 className="mt-4 text-center text-[20px] font-bold text-apple-text">
          管理后台
        </h1>
        <p className="mt-1 text-center text-[13px] text-apple-text-2">
          请输入管理员密码
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="管理员密码"
            autoComplete="current-password"
            autoFocus
            className={inputCls}
            aria-label="管理员密码"
          />
          {error && (
            <p className="text-[13px] text-[#D70015]" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className={`${btnPrimary} h-11 w-full`}
            disabled={loading || !password}
          >
            {loading ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </main>
  );
}

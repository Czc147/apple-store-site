'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, KeyRound, LogIn, Mail, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabaseBrowser } from '@/lib/supabase/client';

/** 登录页四种模式 */
type Mode = 'login' | 'register' | 'forgot' | 'reset';

const MODE_TITLE: Record<Mode, string> = {
  login: '登录',
  register: '注册账号',
  forgot: '找回密码',
  reset: '设置新密码',
};

const inputCls =
  'w-full rounded-xl border border-apple-border bg-white px-4 py-3 text-[15px] text-apple-text placeholder:text-apple-text-3 focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20';

/**
 * 登录 / 注册 / 找回密码 / 重置密码（Supabase Auth · 邮箱+密码）。
 * - 未配置 NEXT_PUBLIC_SUPABASE_* 时整体提示不可用（演示模式）。
 * - 已登录自动跳回 from（或 /library）。
 * - 「忘记密码」走 Supabase 恢复邮件；恢复链接打开站点后 supabase-js
 *   触发 PASSWORD_RECOVERY，自动切到「设置新密码」。
 */
export default function AuthClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/library';
  const { user, loading, configured } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  /** 切模式时清空提示与二次确认密码 */
  const switchMode = useCallback((m: Mode) => {
    setMode(m);
    setError('');
    setNotice('');
    setPassword('');
    setPassword2('');
  }, []);

  // 恢复会话（邮件链接回跳）→ 进入「设置新密码」
  useEffect(() => {
    if (!configured) return;
    const sb = supabaseBrowser();
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('reset');
    });
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  // 已登录（且不在重置密码流程）→ 跳回目标页
  useEffect(() => {
    if (!loading && user && mode !== 'reset') {
      router.replace(from);
    }
  }, [loading, user, mode, from, router]);

  if (!configured) {
    return (
      <div className="mx-auto max-w-md px-5">
        <div className="rounded-card border border-apple-border bg-apple-card p-6 text-center shadow-card">
          <p className="text-[15px] font-semibold text-apple-text">登录暂不可用</p>
          <p className="mt-2 text-[13px] leading-relaxed text-apple-text-2">
            当前未配置 Supabase（NEXT_PUBLIC_SUPABASE_URL / ANON_KEY），
            无法注册或登录。你仍可先以游客身份浏览与兑换。
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    const em = email.trim();

    if (mode !== 'reset' && !em) {
      setError('请输入邮箱');
      return;
    }
    if (mode !== 'forgot') {
      if (!password) {
        setError('请输入密码');
        return;
      }
      if (password.length < 6) {
        setError('密码至少 6 位');
        return;
      }
    }
    if (mode === 'register' && password !== password2) {
      setError('两次输入的密码不一致');
      return;
    }

    setBusy(true);
    const sb = supabaseBrowser();
    try {
      if (mode === 'login') {
        const { error: err } = await sb.auth.signInWithPassword({ email: em, password });
        if (err) throw new Error(friendlyAuthError(err.message));
        router.replace(from);
      } else if (mode === 'register') {
        const { data, error: err } = await sb.auth.signUp({ email: em, password });
        if (err) throw new Error(friendlyAuthError(err.message));
        // 关闭邮箱确认时直接返回 session → 已登录，由上方 effect 跳转；
        // 开启邮箱确认时返回用户但无 session → 提示去查收邮件
        if (!data.session) {
          setNotice('注册成功！请前往邮箱完成确认后再登录。');
          setMode('login');
        }
      } else if (mode === 'forgot') {
        const { error: err } = await sb.auth.resetPasswordForEmail(em, {
          redirectTo: typeof window !== 'undefined' ? window.location.origin + '/login' : undefined,
        });
        if (err) throw new Error(friendlyAuthError(err.message));
        setNotice('重置邮件已发送，请前往邮箱点击链接设置新密码。');
      } else if (mode === 'reset') {
        if (password.length < 6) {
          setError('新密码至少 6 位');
          setBusy(false);
          return;
        }
        if (password !== password2) {
          setError('两次输入的密码不一致');
          setBusy(false);
          return;
        }
        const { error: err } = await sb.auth.updateUser({ password });
        if (err) throw new Error(friendlyAuthError(err.message));
        setNotice('密码已更新，正在进入…');
        router.replace(from);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  };

  const isEmailMode = mode !== 'reset';

  return (
    <div className="mx-auto max-w-md px-5">
      <div className="rounded-card border border-apple-border bg-apple-card p-6 shadow-card">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-apple-blue-soft">
            {mode === 'login' ? (
              <LogIn className="h-5 w-5 text-apple-blue" aria-hidden />
            ) : mode === 'register' ? (
              <UserPlus className="h-5 w-5 text-apple-blue" aria-hidden />
            ) : (
              <KeyRound className="h-5 w-5 text-apple-blue" aria-hidden />
            )}
          </span>
          <h2 className="text-[18px] font-bold text-apple-text">{MODE_TITLE[mode]}</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {isEmailMode && (
            <div>
              <label htmlFor="auth-email" className="sr-only">
                邮箱
              </label>
              <input
                id="auth-email"
                type="email"
                className={inputCls}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="邮箱"
                autoComplete="email"
                disabled={busy}
              />
            </div>
          )}

          {mode !== 'forgot' && (
            <div>
              <label htmlFor="auth-password" className="sr-only">
                {mode === 'reset' ? '新密码' : '密码'}
              </label>
              <input
                id="auth-password"
                type="password"
                className={inputCls}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'reset' ? '新密码（至少 6 位）' : '密码（至少 6 位）'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                disabled={busy}
              />
            </div>
          )}

          {(mode === 'register' || mode === 'reset') && (
            <div>
              <label htmlFor="auth-password2" className="sr-only">
                确认密码
              </label>
              <input
                id="auth-password2"
                type="password"
                className={inputCls}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="确认密码"
                autoComplete="new-password"
                disabled={busy}
              />
            </div>
          )}

          {error && (
            <p className="text-[13px] text-[#D70015]" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="text-[13px] text-[#1B7F3B]">{notice}</p>
          )}

          <button
            type="submit"
            className="w-full rounded-btn bg-apple-blue py-3 text-[15px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.3)] transition-[background-color,transform] duration-200 ease-apple hover:bg-apple-blue-hover active:scale-[0.99] active:bg-apple-blue-active disabled:cursor-not-allowed disabled:bg-apple-border disabled:text-apple-text-3"
            disabled={busy}
          >
            {busy
              ? '处理中…'
              : mode === 'login'
                ? '登录'
                : mode === 'register'
                  ? '注册'
                  : mode === 'forgot'
                    ? '发送重置邮件'
                    : '保存新密码'}
          </button>
        </form>

        {/* 模式切换 */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-apple-hairline pt-4 text-[13px]">
          {mode === 'login' && (
            <>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="font-medium text-apple-blue transition hover:text-apple-blue-hover"
              >
                没有账号？注册
              </button>
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-apple-text-2 transition hover:text-apple-text"
              >
                忘记密码？
              </button>
            </>
          )}
          {mode === 'register' && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="inline-flex items-center gap-1 font-medium text-apple-blue transition hover:text-apple-blue-hover"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              已有账号？返回登录
            </button>
          )}
          {(mode === 'forgot' || mode === 'reset') && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="inline-flex items-center gap-1 font-medium text-apple-blue transition hover:text-apple-blue-hover"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              返回登录
            </button>
          )}
        </div>
      </div>

      {mode === 'login' && (
        <p className="mt-5 flex items-start gap-1.5 px-1 text-[12.5px] leading-relaxed text-apple-text-3">
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          登录后可把兑换的每日计划与内容同步到「我的库」，换设备也能找回。
        </p>
      )}
    </div>
  );
}

/** Supabase Auth 常见英文错误 → 中文文案 */
function friendlyAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return '邮箱或密码不正确';
  if (m.includes('already registered') || m.includes('already been registered'))
    return '该邮箱已注册，请直接登录';
  if (m.includes('email not confirmed')) return '邮箱尚未验证，请先查收验证邮件';
  if (m.includes('rate limit') || m.includes('too many')) return '尝试次数过多，请稍后再试';
  if (m.includes('password should be at least')) return '密码至少 6 位';
  if (m.includes('invalid email') || m.includes('unable to validate email'))
    return '邮箱格式不正确';
  if (m.includes('email rate limit')) return '邮件发送过于频繁，请稍后再试';
  return msg;
}

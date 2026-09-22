'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabaseBrowser } from '@/lib/supabase/client';
import Surface from '@/components/ui/Surface';
import PremiumOrbi, { type OrbiMood } from '@/components/premium-orbi/PremiumOrbi';
import LoginCard, { LoginField, PasswordField } from './LoginCard';

/** 登录页四种模式 */
type Mode = 'login' | 'register' | 'forgot' | 'reset';

const MODE_TITLE: Record<Mode, string> = {
  login: '登录',
  register: '注册账号',
  forgot: '找回密码',
  reset: '设置新密码',
};

/** 各模式的一句话说明（表单可读性，不承载任何业务分支） */
const MODE_HINT: Record<Mode, string> = {
  login: '用邮箱与密码登录',
  register: '用邮箱与密码创建账号',
  forgot: '输入注册邮箱，接收重置链接',
  reset: '设置新的登录密码',
};

/**
 * 登录 / 注册 / 找回密码 / 重置密码（Supabase Auth · 邮箱+密码）。
 * - 未配置 NEXT_PUBLIC_SUPABASE_* 时整体提示不可用（演示模式）。
 * - 已登录自动跳回 from（或 /library）。
 * - 「忘记密码」走 Supabase 恢复邮件；恢复链接打开站点后 supabase-js
 *   触发 PASSWORD_RECOVERY，自动切到「设置新密码」。
 *
 * Phase 10 收敛：输入框 → TextField（focus 方案 A 唯一标准）；裸 hex
 * 错误/成功文字 → Message；提交钮手抄类串 → Button；模式切换钮命中扩到 44pt。
 * 认证逻辑（四模式状态机 / friendlyAuthError / PASSWORD_RECOVERY）逐行保留。
 *
 * UI 升级 §8.8（白色/浅灰 + 表单居中 + 交易控件优先，禁用彩色玻璃）：
 * 白卡 24px 圆角、表单头居中（图标 + 模式标题 + 一句话说明）、
 * 输入框保持 TextField 44pt 高、提交钮为品牌蓝胶囊、
 * 错误/通知 Message 紧贴输入区且淡入出现。
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
  const [showPassword, setShowPassword] = useState(false);
  /** 当前聚焦的字段 —— 驱动 Orbi 的情绪（照文档 LoginPage 的设计） */
  const [field, setField] = useState<'email' | 'password' | null>(null);

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
      <div className="mx-auto w-full max-w-md px-page">
        <Surface radius="card-lg" className="p-6 text-center sm:p-8">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-apple-blue-soft">
            <KeyRound className="h-6 w-6 text-apple-blue" strokeWidth={1.8} aria-hidden />
          </span>
          <p className="mt-3.5 text-xl font-semibold tracking-tight text-apple-text">
            登录暂不可用
          </p>
          <p className="mx-auto mt-2 max-w-[320px] text-sm leading-relaxed text-apple-text-2">
            当前未配置 Supabase（NEXT_PUBLIC_SUPABASE_URL / ANON_KEY），
            无法注册或登录。你仍可先以游客身份浏览与兑换。
          </p>
        </Surface>
      </div>
    );
  }

  const handleSubmit = async () => {
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

  /**
   * Orbi 情绪 —— 照文档 LoginPage 的设计：聚焦哪个字段、有没有出错、
   * 是不是在提交，都会反映在小机器人脸上。这是这个登录页的主角，
   * 不是装饰：用户能一眼看出"它在看我打字""它在想""它被吓到了"。
   */
  const mood: OrbiMood = busy
    ? 'thinking'
    : error
      ? 'surprised'
      : field === 'password'
        ? 'shy'
        : field === 'email'
          ? 'watching'
          : notice
            ? 'happy'
            : 'welcome';

  const submitLabel =
    mode === 'login'
      ? '登录'
      : mode === 'register'
        ? '创建账号'
        : mode === 'forgot'
          ? '发送重置邮件'
          : '设置新密码';

  /** 必填项没填就禁掉提交（文档版是 `!email || !password`，这里按模式取） */
  const canSubmit =
    (mode === 'reset' || email.trim().length > 0) &&
    (mode === 'forgot' || password.length > 0);

  return (
    <div className="login-stage">
      <div className="login-orbi">
        <PremiumOrbi mood={mood} size={168} />
      </div>

      <LoginCard
        title={MODE_TITLE[mode]}
        subtitle={MODE_HINT[mode]}
        loading={busy}
        error={error}
        notice={notice}
        submitLabel={submitLabel}
        submitDisabled={!canSubmit}
        onSubmit={() => void handleSubmit()}
        footer={
          mode === 'login' ? (
            <>
              <div className="login-forgot">
                <button
                  type="button"
                  className="login-linkbtn"
                  onClick={() => switchMode('forgot')}
                >
                  忘记密码？
                </button>
              </div>

              <div className="login-divider">
                <span />
                <span>或者</span>
                <span />
              </div>

              <div className="login-register">
                <span>还没有账号？</span>
                <button
                  type="button"
                  className="login-linkbtn"
                  onClick={() => switchMode('register')}
                >
                  创建账号 <span className="register-arrow">→</span>
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="login-linkbtn"
              onClick={() => switchMode('login')}
            >
              ← 返回登录
            </button>
          )
        }
      >
        {mode !== 'reset' && (
          <LoginField
            id="login-email"
            label="邮箱"
            type="email"
            value={email}
            placeholder="输入你的邮箱"
            autoComplete="email"
            disabled={busy}
            onChange={setEmail}
            onFocus={() => setField('email')}
            onBlur={() => setField(null)}
          />
        )}

        {mode !== 'forgot' && (
          <PasswordField
            id="login-password"
            label={mode === 'reset' ? '新密码' : '密码'}
            value={password}
            placeholder={mode === 'reset' ? '设置新密码（至少 6 位）' : '输入你的密码'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            disabled={busy}
            show={showPassword}
            onToggleShow={() => setShowPassword((v) => !v)}
            onChange={setPassword}
            onFocus={() => setField('password')}
            onBlur={() => setField(null)}
          />
        )}

        {(mode === 'register' || mode === 'reset') && (
          <PasswordField
            id="login-password2"
            label="确认密码"
            value={password2}
            placeholder="再输入一次"
            autoComplete="new-password"
            disabled={busy}
            show={showPassword}
            onToggleShow={() => setShowPassword((v) => !v)}
            onChange={setPassword2}
            onFocus={() => setField('password')}
            onBlur={() => setField(null)}
          />
        )}
      </LoginCard>
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

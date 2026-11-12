'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { useAuth } from '@/lib/auth-context';
import { supabaseBrowser } from '@/lib/supabase/client';
import { getClaimDeviceId } from '@/lib/device-id';
import { clearStoredReferralCode, getStoredReferralCode } from '@/lib/referral-client';
import PremiumOrbi, { type OrbiMood } from '@/components/premium-orbi/PremiumOrbi';
import LoginCard, { LoginField, PasswordField } from '@/components/auth/LoginCard';
import EmailCodeAuth from './EmailCodeAuth';
import { checkEmailAuthAccount, clearEmailPasswordFlag, readEmailConfirmationEnabled, writeEmailPassword } from './app-services';
import { emailAuthError, type EmailCodeProof } from './logic';
import { cancelPasswordSetup, clearPendingPassword, hasPendingPassword, markPendingPassword, releasePendingSession } from './pending-session';

type Mode = 'login' | 'signup' | 'recovery' | 'password';

/** Application integration; the reusable OTP component remains importable alone. */
export default function AuthClientIntegration() {
  const router = useRouter();
  const params = useSearchParams() ?? new URLSearchParams();
  const requestedFrom = params.get('from') || '/library';
  const from = requestedFrom.startsWith('/') && !requestedFrom.startsWith('//') && !requestedFrom.includes('\\') ? requestedFrom : '/library';
  const { user, loading, configured } = useAuth();
  const [mode, setMode] = useState<Mode>(() => params.get('mode') === 'register' ? 'signup'
    : params.get('recovery') === '1' || ['forgot', 'old-reset'].includes(params.get('mode') ?? '') ? 'recovery' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(params.get('notice') === 'password-updated' ? '密码已更新，请使用新密码登录。' : '');
  const [field, setField] = useState<'email' | 'password' | null>(null);
  const forcedSession = useRef<Session | null>(null);

  useEffect(() => {
    // OTP creates a session before password setup. Never redirect this intermediate state.
    if (!loading && user && mode === 'login' && !busy) {
      if (hasPendingPassword(user.id)) {
        setMode('recovery'); setNotice('上次密码设置未完成，请重新验证邮箱。');
        void releasePendingSession(supabaseBrowser().auth, { purpose: 'recovery', userId: user.id, email: user.email ?? '' }).catch(() => setError('请退出登录后重新验证邮箱'));
      } else router.replace(from);
    }
  }, [loading, user, mode, busy, from, router]);

  const switchMode = (next: Mode) => { setPassword(''); setConfirmation(''); setError(''); setNotice(''); setMode(next); };
  const recordLogin = async (token: string) => {
    try { await fetch('/api/auth/login-events', { method: 'POST', headers: { authorization: `Bearer ${token}` } }); } catch { /* Optional audit. */ }
  };
  const bindReferral = async (session: Session) => {
    const code = getStoredReferralCode();
    if (!code) return;
    const response = await fetch('/api/referrals/bind', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ code, invitee_id: session.user.id, invitee_email: session.user.email, device_id: getClaimDeviceId() }),
    });
    if (response.ok) clearStoredReferralCode();
  };
  const complete = (purpose: 'signup' | 'recovery') => {
    setMode('login'); setPassword(''); setConfirmation(''); setError('');
    setNotice(purpose === 'signup' ? '注册完成，请使用邮箱和密码登录。' : '密码已更新，请使用新密码登录。');
  };
  const submit = async () => {
    if (busy || !configured) return;
    setBusy(true); setError(''); setNotice('');
    const sb = supabaseBrowser();
    try {
      if (mode === 'login') {
        const result = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) {
          if (result.error.message.toLowerCase().includes('invalid login credentials')) throw new Error('邮箱或密码不正确');
          if (result.error.message.toLowerCase().includes('email not confirmed')) throw new Error('请先完成邮箱验证码验证');
          throw result.error;
        }
        const token = result.data.session?.access_token;
        const status = await checkEmailAuthAccount(token);
        if (hasPendingPassword(result.data.user.id)) {
          setMode('recovery'); await releasePendingSession(sb.auth, { purpose: 'recovery', userId: result.data.user.id, email: result.data.user.email ?? '' });
          setNotice('上次密码设置未完成，请重新验证邮箱。'); return;
        }
        if (token) await recordLogin(token);
        if (status.mustChangePassword) {
          forcedSession.current = result.data.session;
          const proof: EmailCodeProof = { userId: result.data.user.id, email: result.data.user.email ?? '', purpose: 'recovery' };
          if (!markPendingPassword(proof)) throw new Error('请允许网站存储验证进度后重试');
          setPassword(''); setMode('password'); setNotice('请先设置新密码');
        }
        else router.replace(from);
      } else if (mode === 'password') {
        if (password.length < 6) throw new Error('密码至少 6 位');
        if (password !== confirmation) throw new Error('两次输入的密码不一致');
        const current = await sb.auth.getSession();
        const origin = forcedSession.current;
        if (!origin?.access_token || current.data.session?.user.id !== origin.user.id) throw new Error('验证账号已改变，请重新登录');
        const token = origin.access_token;
        await checkEmailAuthAccount(token);
        await writeEmailPassword(token, password);
        clearPendingPassword(origin.user.id); forcedSession.current = null;
        if (token) { try { await clearEmailPasswordFlag(token); } catch { /* Retry flag on next login. */ } }
        await sb.auth.signOut(); complete('recovery');
      }
    } catch (e) {
      await sb.auth.signOut({ scope: 'local' }); setError(emailAuthError(e));
    } finally { setBusy(false); }
  };

  const mood: OrbiMood = busy ? 'thinking' : error ? 'surprised' : field === 'password' ? 'shy' : field === 'email' ? 'watching' : notice ? 'happy' : 'welcome';
  if (!configured) return <p role="status" className="px-page py-12 text-center">登录暂不可用，请稍后再试。</p>;
  return <div className="login-stage">
    <div className="login-orbi"><PremiumOrbi mood={mood} size={168} /></div>
    {mode === 'signup' || mode === 'recovery' ? <EmailCodeAuth
      key={mode} purpose={mode} auth={supabaseBrowser().auth}
      readConfirmationEnabled={readEmailConfirmationEnabled} writePassword={writeEmailPassword}
      checkAccount={async token => { await checkEmailAuthAccount(token); }}
      onPasswordSet={clearEmailPasswordFlag} onRegistered={bindReferral}
      onComplete={complete} onCancel={() => switchMode('login')}
    /> : <LoginCard
      title={mode === 'password' ? '设置新密码' : '登录'}
      subtitle={mode === 'password' ? '设置新的登录密码' : '用邮箱与密码登录'}
      loading={busy} error={error} notice={notice}
      submitLabel={mode === 'password' ? '保存新密码' : '登录'}
      submitDisabled={!password || (mode === 'login' && !email.trim())}
      onSubmit={() => void submit()}
      footer={mode === 'login' ? <>
        <div className="login-forgot"><button type="button" className="login-linkbtn" disabled={busy} onClick={() => switchMode('recovery')}>忘记密码？</button></div>
        <div className="login-divider"><span /><span>或者</span><span /></div>
        <div className="login-register"><span>还没有账号？</span><button type="button" className="login-linkbtn" disabled={busy} onClick={() => switchMode('signup')}>创建账号 <span className="register-arrow">→</span></button></div>
      </> : <button type="button" className="login-linkbtn" disabled={busy} onClick={() => {
        void cancelPasswordSetup(supabaseBrowser().auth, () => {
          if (forcedSession.current) clearPendingPassword(forcedSession.current.user.id);
          forcedSession.current = null; switchMode('login');
        }).catch(e => setError(emailAuthError(e)));
      }}>返回登录</button>}
    >
      {mode === 'login' && <LoginField id="login-email" label="邮箱" type="email" value={email} autoComplete="email" placeholder="输入你的邮箱" disabled={busy} onChange={setEmail} onFocus={() => setField('email')} onBlur={() => setField(null)} />}
      <PasswordField id="login-password" label={mode === 'password' ? '新密码' : '密码'} value={password} autoComplete={mode === 'password' ? 'new-password' : 'current-password'} placeholder={mode === 'password' ? '设置新密码（至少 6 位）' : '输入你的密码'} disabled={busy} show={showPassword} onToggleShow={() => setShowPassword(v => !v)} onChange={setPassword} onFocus={() => setField('password')} onBlur={() => setField(null)} />
      {mode === 'password' && <PasswordField id="login-password2" label="确认新密码" value={confirmation} autoComplete="new-password" placeholder="再输入一次" disabled={busy} show={showPassword} onToggleShow={() => setShowPassword(v => !v)} onChange={setConfirmation} onFocus={() => setField('password')} onBlur={() => setField(null)} />}
    </LoginCard>}
  </div>;
}

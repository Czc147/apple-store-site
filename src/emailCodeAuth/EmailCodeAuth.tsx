'use client';

import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { emailAuthError, finishEmailPassword, normalizeEmail, requestEmailCode, resendEmailCode, verifyEmailCode, type EmailAuthPort, type EmailCodeProof, type EmailCodePurpose } from './logic';
import './styles.css';
import { clearPendingPassword, markPendingPassword, releasePendingSession } from './pending-session';

export interface EmailCodeAuthProps {
  purpose: EmailCodePurpose;
  auth: EmailAuthPort;
  configured?: boolean;
  checkAccount: (token: string) => Promise<void>;
  writePassword: (token: string, password: string) => Promise<void>;
  readConfirmationEnabled?: () => Promise<boolean>;
  onRegistered?: (session: Session) => Promise<void>;
  onPasswordSet?: (token: string) => Promise<void>;
  onComplete?: (purpose: EmailCodePurpose) => void;
  onCancel?: () => void;
}

/** Application services are injected; this core does not import a page or global auth client. */
export default function EmailCodeAuth({ purpose, auth, configured = true, checkAccount, writePassword, readConfirmationEnabled, onRegistered, onPasswordSet, onComplete, onCancel }: EmailCodeAuthProps) {
  const [step, setStep] = useState<'email' | 'code' | 'password' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const deadline = useRef(0);
  const locked = useRef(false);
  const alive = useRef(true);
  const proof = useRef<EmailCodeProof | null>(null);
  const nextFocus = useRef<HTMLInputElement>(null);
  const signup = purpose === 'signup';

  useEffect(() => {
    alive.current = true;
    const tick = setInterval(() => setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))), 1000);
    return () => {
      alive.current = false; clearInterval(tick);
      const pending = proof.current;
      proof.current = null;
      if (pending) void releasePendingSession(auth, pending).catch(() => { /* Persisted marker blocks the next login redirect. */ });
    };
  }, [auth]);
  useEffect(() => { nextFocus.current?.focus(); }, [step]);

  const work = async (action: () => Promise<void>) => {
    if (locked.current || !configured) return;
    locked.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (e) { if (alive.current) setError(emailAuthError(e)); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  };
  const startCooldown = () => { deadline.current = Date.now() + 60_000; setRemaining(60); };
  const send = () => work(async () => {
    const value = normalizeEmail(email);
    await requestEmailCode(auth, purpose, value, signup ? await readConfirmationEnabled?.() : false);
    if (!alive.current) return;
    proof.current = null; setEmail(value); setCode(''); setStep('code'); startCooldown();
    setNotice(signup ? '请查看邮箱中的注册验证码。如果邮箱已注册，请返回登录或找回密码。' : '如果该邮箱已注册，我们会发送验证码，请查看收件箱和垃圾邮件。');
  });
  const verify = () => work(async () => {
    const verified = await verifyEmailCode(auth, purpose, email, code);
    proof.current = verified;
    const marked = markPendingPassword(verified);
    if (!alive.current || !marked) {
      await releasePendingSession(auth, verified); proof.current = null;
      if (!marked && alive.current) throw new Error('请允许网站存储验证进度后重试');
      return;
    }
    // A recovery/confirmation session is only usable after the app's restriction check.
    const { data } = await auth.getSession();
    if (!data.session?.access_token) throw new Error('验证会话已失效，请重新获取验证码');
    try { await checkAccount(data.session.access_token); }
    catch (e) { await releasePendingSession(auth, verified); proof.current = null; throw e; }
    if (!alive.current) { await releasePendingSession(auth, verified); proof.current = null; return; }
    proof.current = verified; setCode(''); setNotice('邮箱验证通过，请设置密码。'); setStep('password');
  });
  const finish = () => work(async () => {
    if (password !== confirmation) throw new Error('两次输入的密码不一致');
    const session = await finishEmailPassword(auth, proof.current, password, checkAccount, writePassword);
    clearPendingPassword(session.user.id);
    if (onPasswordSet) { try { await onPasswordSet(session.access_token); } catch { /* Profile flag retry must not undo password update. */ } }
    if (signup && onRegistered) { try { await onRegistered(session); } catch { /* Attribution must not undo a completed password update. */ } }
    const signedOut = await auth.signOut();
    if (signedOut.error) {
      const local = await auth.signOut({ scope: 'local' });
      if (local.error) throw new Error('密码已更新，但退出失败，请重新登录');
    }
    if (!alive.current) return;
    proof.current = null; setPassword(''); setConfirmation(''); setNotice(signup ? '注册完成，请使用邮箱和密码登录。' : '密码已更新，请使用新密码登录。'); setStep('done');
    onComplete?.(purpose);
  });
  const resend = () => work(async () => {
    if (Date.now() < deadline.current) return;
    proof.current = null; setCode('');
    await resendEmailCode(auth, purpose, email);
    if (alive.current) { startCooldown(); setNotice('验证码已重新发送，请查看最新邮件。'); }
  });
  const cancel = () => work(async () => {
    if (proof.current) await releasePendingSession(auth, proof.current);
    proof.current = null; onCancel?.();
  });

  return <section className="email-code-auth" aria-labelledby={`email-code-${purpose}-title`}>
    <h1 id={`email-code-${purpose}-title`}>{signup ? '注册账号' : '重置密码'}</h1>
    <p className="email-code-hint">{step === 'email' ? (signup ? '验证邮箱后设置登录密码。' : '验证注册邮箱后设置新密码。') : step === 'code' ? `输入发送至 ${email} 的数字验证码。` : step === 'password' ? '请输入新密码，并再次输入确认。' : '请返回登录继续使用。'}</p>
    <form onSubmit={event => { event.preventDefault(); if (step === 'email') void send(); else if (step === 'code') void verify(); else if (step === 'password') void finish(); }} aria-busy={busy}>
      {step === 'email' && <label>邮箱<input ref={nextFocus} type="email" autoComplete="email" required value={email} disabled={busy || !configured} onChange={e => setEmail(e.target.value)} /></label>}
      {step === 'code' && <>
        <label>邮箱验证码<input ref={nextFocus} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required value={code} disabled={busy} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></label>
        <div className="email-code-actions">
          <button type="button" disabled={busy || remaining > 0} onClick={() => void resend()}>{remaining > 0 ? `${remaining} 秒后重新发送` : '重新发送验证码'}</button>
          <button type="button" disabled={busy} onClick={() => { proof.current = null; setCode(''); setError(''); setNotice(''); setStep('email'); }}>更换邮箱</button>
        </div>
      </>}
      {step === 'password' && <>
        <label>新密码<input ref={nextFocus} type="password" autoComplete="new-password" minLength={6} required disabled={busy} value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label>确认新密码<input type="password" autoComplete="new-password" minLength={6} required disabled={busy} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      </>}
      {notice && <p role="status" className="email-code-notice">{notice}</p>}
      {!configured && <p role="status">暂时无法验证邮箱，请稍后再试。</p>}
      {error && <p role="alert" className="email-code-error">{error}</p>}
      {step !== 'done' && <button className="email-code-primary" type="submit" disabled={busy || !configured}>{busy ? '正在处理…' : step === 'email' ? '发送验证码' : step === 'code' ? '验证并继续' : signup ? '完成注册' : '保存新密码'}</button>}
    </form>
    {onCancel && <button className="email-code-back" type="button" disabled={busy} onClick={() => void cancel()}>返回登录</button>}
  </section>;
}

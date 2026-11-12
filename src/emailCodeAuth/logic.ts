import type { Session, SupabaseClient } from '@supabase/supabase-js';

export type EmailCodePurpose = 'signup' | 'recovery';
export type EmailAuthPort = Pick<SupabaseClient['auth'], 'signUp' | 'resend' | 'resetPasswordForEmail' | 'verifyOtp' | 'getSession' | 'getUser' | 'updateUser' | 'signOut'>;
export interface EmailCodeProof { purpose: EmailCodePurpose; email: string; userId: string }

export function normalizeEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('请输入有效的邮箱地址');
  return value;
}

export function emailAuthError(error: unknown): string {
  const raw = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  const message = raw.toLowerCase();
  if (message.includes('rate') || message.includes('too many')) return '发送或验证过于频繁，请稍后再试';
  if (message.includes('expired') || message.includes('otp') || message.includes('token')) return '验证码无效或已过期，请重新获取';
  if (message.includes('already') && message.includes('registered')) return '该邮箱已注册，请登录或找回密码';
  if (message.includes('password')) return '密码未满足要求，请使用更长且不易猜测的密码';
  if (message.includes('session')) return '验证会话已失效，请重新获取验证码';
  if (message.includes('email') && message.includes('invalid')) return '请输入有效的邮箱地址';
  // Keep app-authored Chinese messages, never display arbitrary upstream details.
  return /[\u4e00-\u9fff]/.test(raw) ? raw : '操作未完成，请稍后重试';
}

export async function requestEmailCode(auth: EmailAuthPort, purpose: EmailCodePurpose, email: string, confirmationEnabled = false): Promise<void> {
  const value = normalizeEmail(email);
  if (purpose === 'signup') {
    if (!confirmationEnabled) throw new Error('注册邮箱验证尚未启用，请稍后再试');
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const password = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('') + 'aA1!';
    const { data, error } = await auth.signUp({ email: value, password });
    if (error) throw new Error(emailAuthError(error));
    if (data.session) {
      await auth.signOut();
      throw new Error('注册邮箱验证尚未启用，请稍后再试');
    }
  } else {
    const { error } = await auth.resetPasswordForEmail(value);
    if (error) throw new Error(emailAuthError(error));
  }
}

export async function resendEmailCode(auth: EmailAuthPort, purpose: EmailCodePurpose, email: string): Promise<void> {
  const value = normalizeEmail(email);
  const { error } = purpose === 'signup'
    ? await auth.resend({ type: 'signup', email: value })
    : await auth.resetPasswordForEmail(value);
  if (error) throw new Error(emailAuthError(error));
}

export async function verifyEmailCode(auth: EmailAuthPort, purpose: EmailCodePurpose, email: string, code: string): Promise<EmailCodeProof> {
  const value = normalizeEmail(email);
  const token = code.trim();
  if (!/^\d{6,10}$/.test(token)) throw new Error('请输入邮件中的完整数字验证码');
  const { data, error } = await auth.verifyOtp({ email: value, token, type: purpose });
  if (error) throw new Error(emailAuthError(error));
  if (!data.session?.access_token || !data.session.user?.id) throw new Error('验证未建立有效会话，请重新获取验证码');
  if (data.session.user.email?.toLowerCase() !== value) {
    await auth.signOut();
    throw new Error('验证邮箱不匹配，请重新获取验证码');
  }
  return { purpose, email: value, userId: data.session.user.id };
}

export async function finishEmailPassword(auth: EmailAuthPort, proof: EmailCodeProof | null, password: string, checkAccount: (token: string) => Promise<void>, writePassword: (token: string, password: string) => Promise<void>): Promise<Session> {
  if (!proof) throw new Error('请先验证邮箱验证码');
  if (password.length < 6) throw new Error('密码至少 6 位');
  const { data, error } = await auth.getSession();
  const session = data.session;
  if (error || !session?.access_token) throw new Error('验证会话已失效，请重新获取验证码');
  if (session.user.id !== proof.userId || session.user.email?.toLowerCase() !== proof.email) throw new Error('验证邮箱或账号已改变，请重新验证');
  const identity = await auth.getUser();
  if (identity.error || identity.data.user?.id !== proof.userId || identity.data.user.email?.toLowerCase() !== proof.email) throw new Error('验证会话已失效，请重新获取验证码');
  await checkAccount(session.access_token);
  const latest = await auth.getSession();
  if (latest.error || !latest.data.session?.access_token || latest.data.session.user.id !== proof.userId || latest.data.session.user.email?.toLowerCase() !== proof.email) throw new Error('验证账号已改变，请重新验证邮箱');
  // An SDK updateUser call would re-read mutable shared storage and can target a
  // different account. The adapter MUST send this captured token explicitly.
  await writePassword(session.access_token, password);
  return session;
}

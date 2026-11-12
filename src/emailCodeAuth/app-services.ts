import { emailAuthError } from './logic';
/** Site adapters, separate from reusable OTP logic and UI. */
export async function writeEmailPassword(token: string, password: string): Promise<void> {
  if (!token) throw new Error('验证会话已失效，请重新验证邮箱');
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('密码设置暂不可用，请稍后再试');
  const response = await fetch('/api/supabase/auth/user', {
    method: 'PUT', headers: { apikey: key, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ password }), cache: 'no-store',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(emailAuthError({ message: payload.msg ?? payload.message ?? payload.error_description }));
  }
}
export async function readEmailConfirmationEnabled(): Promise<boolean> {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('注册暂不可用，请稍后再试');
  const response = await fetch('/api/supabase/auth/settings', { headers: { apikey: key }, cache: 'no-store' });
  if (!response.ok) throw new Error('注册暂不可用，请稍后再试');
  const settings = await response.json();
  if (typeof settings.mailer_autoconfirm !== 'boolean') throw new Error('注册暂不可用，请稍后再试');
  return settings.mailer_autoconfirm === false;
}
export async function checkEmailAuthAccount(token: string | null | undefined): Promise<{ mustChangePassword: boolean }> {
  if (!token) throw new Error('验证会话已失效，请重新验证邮箱');
  const response = await fetch('/api/account/status', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw new Error('账号状态检查未通过，请重新登录或联系客服');
  const result = await response.json();
  if (!Array.isArray(result.restrictions)) throw new Error('账号状态检查失败，请稍后再试');
  if (result.restrictions.some((row: { scope: string }) => row.scope === 'login')) throw new Error('账号已被限制登录，请联系客服');
  return { mustChangePassword: Boolean(result.must_change_password) };
}
export async function clearEmailPasswordFlag(token: string): Promise<void> {
  await fetch('/api/account/status', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'password_changed' }) });
}

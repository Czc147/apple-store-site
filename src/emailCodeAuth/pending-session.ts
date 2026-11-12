import type { EmailAuthPort, EmailCodeProof } from './logic';

type MarkerStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (id: string) => `zorvin:email-password-pending:${id}`;
function browserStorage(): MarkerStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; }
}
/** Only an unfinished-flow marker; never store a token, password or OTP. */
export function markPendingPassword(proof: EmailCodeProof, storage = browserStorage()): boolean {
  try { if (!storage) return false; storage.setItem(key(proof.userId), proof.purpose); return true; } catch { return false; }
}
export function hasPendingPassword(userId: string, storage = browserStorage()): boolean {
  try { return Boolean(storage?.getItem(key(userId))); } catch { return true; }
}
export function clearPendingPassword(userId: string, storage = browserStorage()): void {
  try { storage?.removeItem(key(userId)); } catch { /* Fail closed: a remaining marker will require verification again. */ }
}
export async function releasePendingSession(auth: Pick<EmailAuthPort, 'getSession' | 'signOut'>, proof: EmailCodeProof, storage = browserStorage()): Promise<void> {
  const current = await auth.getSession();
  if (current.error) throw new Error('无法清理验证会话，请重新登录');
  if (current.data.session?.user.id === proof.userId) {
    const result = await auth.signOut({ scope: 'local' });
    if (result.error) throw new Error('无法退出验证会话，请稍后再试');
  }
  clearPendingPassword(proof.userId, storage);
}
export async function cancelPasswordSetup(auth: Pick<EmailAuthPort, 'signOut'>, onCancel: () => void): Promise<void> {
  const result = await auth.signOut({ scope: 'local' });
  if (result.error) throw new Error('无法退出验证会话，请稍后再试');
  onCancel();
}

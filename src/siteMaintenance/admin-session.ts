/** Edge-compatible verification of the existing lib/auth HMAC session format.
 * This only exempts authenticated admin API requests; it does not grant endpoint
 * permissions and never bypasses the storefront maintenance page.
 */
export async function verifyMaintenanceAdmin(token: string | undefined, secret = process.env.ADMIN_PASSWORD): Promise<boolean> {
  if (!token || !secret) return false;
  const match = /^(\d+)\.([a-f0-9]{64})$/.exec(token);
  if (!match || !Number.isFinite(Number(match[1])) || Number(match[1]) < Date.now()) return false;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const signature = new Uint8Array(match[2].match(/../g)!.map(pair => parseInt(pair, 16)));
    return await crypto.subtle.verify('HMAC', key, signature, encoder.encode(match[1]));
  } catch { return false; }
}

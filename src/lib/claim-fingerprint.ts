import { createHmac } from 'node:crypto';
import { getClientIp } from '@/lib/rate-limit';

function hash(kind: string, value: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'development-only-secret';
  return createHmac('sha256', secret).update(`${kind}:${value}`).digest('hex');
}

export function claimFingerprint(req: Request, deviceId: string) {
  return {
    ipHash: hash('ip', getClientIp(req)),
    deviceHash: deviceId ? hash('device', deviceId) : null,
  };
}

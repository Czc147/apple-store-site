import type { NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  DAILY_LOCKED,
  getDailyAccessByUserId,
  getDailyAccessByCode,
} from '@/lib/daily-access';

export const dynamic = 'force-dynamic';

/**
 * POST /api/daily-access — 校验「每日计划」解锁状态
 *
 * 凭证二选一（Bearer 优先）：
 * - Authorization: Bearer <Supabase access token> → 查账号权益
 * - body { code } → 游客以已核销的解锁码为凭证（服务端现算有效期）
 *
 * 响应 200：{ unlocked, permanent, expired, expires_at, remaining_days }
 * 无论何种失败原因（码不存在/未核销/非解锁码/已过期）unlocked 均为 false，
 * 不区分文案，防止枚举探测有效码。
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }
  if (!rateLimit('daily-access', getClientIp(req), 40, 60_000)) {
    return fail('操作过于频繁，请稍后再试', 429);
  }

  try {
    const user = await getRequestUser(req);
    const body = await parseBody(req);
    const code = typeof body?.code === 'string' ? body.code.trim() : '';

    if (user) {
      const status = await getDailyAccessByUserId(user.id);
      // 账号无权益（尚未同步）时回退码凭证，覆盖登录后未同步的窗口期
      if (!status.unlocked && code) {
        return ok(await getDailyAccessByCode(code));
      }
      return ok(status);
    }

    if (!code) return ok(DAILY_LOCKED);
    return ok(await getDailyAccessByCode(code));
  } catch (e) {
    return fail(e instanceof Error ? e.message : '校验失败', 500);
  }
}

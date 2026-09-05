import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  getDailyAccessByUserId,
  getDailyAccessByCode,
} from '@/lib/daily-access';
import { isValidPickDate } from '@/lib/daily';
import { classifyMedia } from '@/lib/upload';

export const dynamic = 'force-dynamic';

/** 内容签名 URL 有效期（秒）：1 小时，前端 403 时重新调用本接口续取 */
const CONTENT_SIGNED_TTL = 3600;

/**
 * POST /api/daily-content — 获取某日每日推荐正文（需解锁凭证）
 *
 * 请求体：{ pick_date: 'YYYY-MM-DD', code?: string }
 * 凭证：Authorization Bearer（登录，优先）或 body.code（游客已核销解锁码）。
 *
 * 响应 200：{ pick_date, title, description, link_url, media_url, media_kind }
 * - media_url：私有桶 daily 的 1 小时签名链接（现签现用，不落库不打日志）
 * - 未解锁/过期 → 403 统一文案（不区分原因，防枚举）
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }
  if (!rateLimit('daily-content', getClientIp(req), 60, 60_000)) {
    return fail('操作过于频繁，请稍后再试', 429);
  }

  const body = await parseBody(req);
  if (!body || !isValidPickDate(body.pick_date)) {
    return fail('缺少有效日期 pick_date');
  }

  try {
    // ---- 解锁校验（Bearer 优先，游客用码；账号无权益时回退码凭证） ----
    const user = await getRequestUser(req);
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    let status = user
      ? await getDailyAccessByUserId(user.id)
      : await getDailyAccessByCode(code);
    if (user && !status.unlocked && code) {
      status = await getDailyAccessByCode(code);
    }
    if (!status.unlocked) {
      return fail('尚未解锁每日计划，订阅或输入兑换码后可查看', 403);
    }

    // ---- 取当日内容 ----
    const db = supabaseAdmin();
    const { data: pick, error } = await db
      .from('daily_picks')
      .select('pick_date, title, description, media_path, link_url')
      .eq('pick_date', body.pick_date)
      .maybeSingle();
    if (error) return fail(error.message, 500);
    if (!pick) return fail('该日期暂无每日推荐', 404);

    const row = pick as {
      pick_date: string;
      title: string;
      description: string | null;
      media_path: string | null;
      link_url: string | null;
    };

    let mediaUrl: string | null = null;
    if (row.media_path) {
      const { data: signed, error: signErr } = await db.storage
        .from('daily')
        .createSignedUrl(row.media_path, CONTENT_SIGNED_TTL);
      if (signErr) return fail(`内容获取失败：${signErr.message}`, 500);
      mediaUrl = signed.signedUrl;
    }

    return ok({
      pick_date: row.pick_date,
      title: row.title,
      description: row.description,
      link_url: row.link_url,
      media_url: mediaUrl,
      media_kind: row.media_path ? classifyMedia(row.media_path) : null,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : '获取失败', 500);
  }
}

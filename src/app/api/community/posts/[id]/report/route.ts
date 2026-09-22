import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { REPORT_REASON_KEYS } from '@/lib/report-reasons';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const MAX_DETAIL_LEN = 300;

interface Ctx {
  params: { id: string };
}

/**
 * POST /api/community/posts/:id/report — 举报帖子（需登录）
 * 请求体：{ reason, detail? }
 *
 * 同一人对同一帖只留一条（唯一索引 + 23505 兜底）：
 * 反复点不该刷屏后台，也不该让站长面对十条一模一样的记录去判断。
 * 重复举报按"已收到"返回，不报错 —— 用户主观上就是想再强调一次，
 * 给他一个报错没有意义。
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录后再举报', 401);
  if (!rateLimit('post-report', getClientIp(req), 10, 60_000)) {
    return fail('操作过于频繁，请稍后再试', 429);
  }

  const body = await parseBody(req);
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!REPORT_REASON_KEYS.includes(reason)) {
    return fail('请选择举报理由');
  }
  const detailRaw = typeof body?.detail === 'string' ? body.detail.trim() : '';
  if (detailRaw.length > MAX_DETAIL_LEN) {
    return fail(`补充说明不能超过 ${MAX_DETAIL_LEN} 字`);
  }

  const db = supabaseAdmin();

  const { data: post } = await db
    .from('community_posts')
    .select('id, user_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!post) return fail('帖子不存在', 404);
  // 举报自己的帖子没有意义，大概率是误点
  if (post.user_id && post.user_id === user.id) {
    return fail('不能举报自己的帖子');
  }

  const { error } = await db.from('post_reports').insert({
    post_id: params.id,
    reporter_id: user.id,
    reason,
    detail: detailRaw || null,
  });
  if (error) {
    if (error.code === '23505') {
      return ok({ reported: true, duplicated: true });
    }
    return fail(error.message, 500);
  }
  return ok({ reported: true, duplicated: false }, 201);
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** POST /api/admin/publications/run — 手动执行到期任务（pg_cron 不可用时的兜底） */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }

  const { data, error } = await supabaseAdmin().rpc('process_scheduled_publications');
  if (error) return fail(`预上线任务执行失败：${error.message}`, 500);
  return ok({ processed: Number(data ?? 0) });
}

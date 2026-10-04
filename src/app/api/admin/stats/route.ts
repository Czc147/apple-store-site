import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/stats — 数据中心聚合指标。
 * 统计在数据库内完成：避免 Node 拉全量订单，同时统一实付收入口径
 *（orders.total - orders.discount_amount）与东八区自然日边界。
 */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }

  const { data, error } = await supabaseAdmin().rpc('admin_data_center_stats');
  if (error) {
    return fail(`数据中心读取失败：${error.message}`, 500);
  }
  return ok(data);
}

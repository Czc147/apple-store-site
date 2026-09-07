import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 站点面向中国大陆市场（微信/支付宝），「今日」按东八区自然日结算
const CN_OFFSET_MS = 8 * 60 * 60 * 1000;

/** GET /api/admin/stats — 后台统计概览（总订单 / 累计收入 / 待确认 / 客单价） */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }

  const { data, error } = await supabaseAdmin()
    .from('orders')
    .select('status, total, created_at, paid_at');
  if (error) return fail(error.message, 500);

  const orders = (data ?? []) as Array<{
    status: string;
    total: number | string;
    created_at: string;
    paid_at: string | null;
  }>;

  const cnNow = new Date(Date.now() + CN_OFFSET_MS);
  const todayStartMs = new Date(
    Date.UTC(cnNow.getUTCFullYear(), cnNow.getUTCMonth(), cnNow.getUTCDate()),
  ).getTime();

  let totalRevenue = 0;
  let paidOrders = 0;
  let pendingOrders = 0;
  let canceledOrders = 0;
  let todayOrders = 0;
  let todayRevenue = 0;

  for (const o of orders) {
    const total = Number(o.total) || 0;
    if (o.status === 'paid') {
      paidOrders += 1;
      totalRevenue += total;
      if (o.paid_at && Date.parse(o.paid_at) >= todayStartMs) todayRevenue += total;
    } else if (o.status === 'pending') {
      pendingOrders += 1;
    } else if (o.status === 'canceled') {
      canceledOrders += 1;
    }
    if (Date.parse(o.created_at) >= todayStartMs) todayOrders += 1;
  }

  return ok({
    total_orders: orders.length,
    total_revenue: totalRevenue,
    pending_orders: pendingOrders,
    paid_orders: paidOrders,
    canceled_orders: canceledOrders,
    today_orders: todayOrders,
    today_revenue: todayRevenue,
    aov: paidOrders > 0 ? totalRevenue / paidOrders : 0,
  });
}

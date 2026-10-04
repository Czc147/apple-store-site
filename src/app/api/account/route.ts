import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

interface ProfileRow {
  display_name: string | null;
  avatar_key: string | null;
  avatar_url: string | null;
}

interface RecentOrder {
  id: string;
  order_no: string;
  status: string;
  total: string | number;
  discount_amount: string | number;
  created_at: string;
}

/**
 * GET /api/account — 当前账号摘要（头像抽屉一次取齐）
 *
 * 只暴露展示所需字段，不返回 Auth 管理信息或业务明细。
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const db = supabaseAdmin();
  const [
    profileResult,
    contentResult,
    subscriptionResult,
    orderResult,
    couponResult,
    recentOrderResult,
  ] = await Promise.all([
    db
      .from('profiles')
      .select('display_name, avatar_key, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle(),
    db
      .from('user_entitlements')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('kind', 'content'),
    db
      .from('user_entitlements')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('kind', 'subscription'),
    db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    db
      .from('coupon_claims')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    db
      .from('orders')
      .select('id, order_no, status, total, discount_amount, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  if (
    profileResult.error ||
    contentResult.error ||
    subscriptionResult.error ||
    orderResult.error ||
    couponResult.error ||
    recentOrderResult.error
  ) {
    return fail('账号摘要加载失败', 500);
  }

  const profile = (profileResult.data ?? null) as ProfileRow | null;
  const recentOrders = (recentOrderResult.data ?? []) as RecentOrder[];

  return ok({
    profile: {
      display_name: profile?.display_name ?? null,
      avatar_key: profile?.avatar_key ?? null,
      avatar_url: profile?.avatar_url ?? null,
    },
    email: user.email,
    stats: {
      contents: contentResult.count ?? 0,
      subscriptions: subscriptionResult.count ?? 0,
      orders: orderResult.count ?? 0,
      coupons: couponResult.count ?? 0,
    },
    recent_orders: recentOrders.map((order) => ({
      id: order.id,
      order_no: order.order_no,
      status: order.status,
      payable: Number(order.total) - Number(order.discount_amount ?? 0),
      created_at: order.created_at,
    })),
  });
}

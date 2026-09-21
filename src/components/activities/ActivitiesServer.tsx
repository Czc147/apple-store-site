import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { DEMO_ACTIVITIES } from '@/lib/demo-data';
import { loadCouponsForActivities } from '@/lib/coupons-server';
import type { CouponWithState } from '@/lib/coupon-types';
import type { Activity } from '@/lib/types';
import DataError from '@/components/ui/DataError';
import ActivitiesClient from './ActivitiesClient';

/**
 * 服务端取数组件（配合 <Suspense> 流式渲染骨架屏）。
 * - 已配置 Supabase：读取 activities（sort_order 升序）+ 各活动下的优惠券
 *   （券在服务端带上，卡片徽标首屏就有；「我的领取状态」由客户端另拉 /api/coupons/mine）
 * - 未配置：降级为演示数据（isDemo=true）
 * - 查询出错：DataError（可重试）；券读取失败不影响活动展示
 */
export default async function ActivitiesServer() {
  let activities: Activity[];
  let isDemo = false;
  let couponsByActivity: Record<string, CouponWithState[]> = {};

  if (!isSupabaseConfigured()) {
    activities = DEMO_ACTIVITIES;
    isDemo = true;
  } else {
    try {
      const { data, error } = await supabaseAdmin()
        .from('activities')
        .select('id, title, image_url, description, link_url, sort_order')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      activities = (data ?? []) as Activity[];

      try {
        const map = await loadCouponsForActivities(
          supabaseAdmin(),
          activities.map((a) => a.id),
          null,
        );
        couponsByActivity = Object.fromEntries(map);
      } catch {
        /* 券加载失败按「该活动无券」处理，不阻断活动页 */
      }
    } catch (e) {
      return (
        <DataError
          message={e instanceof Error ? e.message : '活动数据加载失败'}
        />
      );
    }
  }

  // 双重保险：按 sort_order 升序（兼容演示数据/旧数据）
  activities = [...activities].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <ActivitiesClient
      activities={activities}
      isDemo={isDemo}
      couponsByActivity={couponsByActivity}
    />
  );
}

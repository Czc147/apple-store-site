import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { DEMO_SUBSCRIPTIONS } from '@/lib/demo-data';
import { toNumber } from '@/lib/format';
import { isNetworkError } from '@/lib/network-error';
import type { Subscription } from '@/lib/types';
import DataError from '@/components/ui/DataError';
import SubscriptionsClient from './SubscriptionsClient';

/**
 * 服务端取数组件（配合 <Suspense> 流式渲染骨架屏）。
 * - 已配置 Supabase：读取 subscriptions（sort_order 升序）
 * - 未配置：降级为演示数据（isDemo=true）
 * - 网络不可达：回退演示数据；查询出错：DataError（可重试）
 */
export default async function SubscriptionsServer() {
  let subscriptions: Subscription[];
  let isDemo = false;

  if (!isSupabaseConfigured()) {
    subscriptions = DEMO_SUBSCRIPTIONS;
    isDemo = true;
  } else {
    try {
      const { data, error } = await supabaseAdmin()
        .from('subscriptions')
        // 显式列白名单：新列不写进来，前台永远拿不到（迁移 023 的会员卡与折扣字段同此）
        .select(
          'id, name, price, duration, description, payment_url, link_url, sort_order, card_style, card_text, discount_percent, discount_scope, discount_valid_from, discount_valid_to',
        )
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      // Supabase numeric 列返回字符串，边界处统一转 number
      subscriptions = ((data ?? []) as Subscription[]).map((s) => ({
        ...s,
        price: toNumber(s.price),
      }));
    } catch (e) {
      if (isNetworkError(e)) {
        console.warn('[subscriptions] 数据库不可达，已回退演示数据：', e);
        subscriptions = DEMO_SUBSCRIPTIONS;
        isDemo = true;
      } else {
        return (
          <DataError
            message={e instanceof Error ? e.message : '订阅数据加载失败'}
          />
        );
      }
    }
  }

  // 双重保险：按 sort_order 升序（兼容演示数据/旧数据）
  subscriptions = [...subscriptions].sort((a, b) => a.sort_order - b.sort_order);

  return <SubscriptionsClient subscriptions={subscriptions} isDemo={isDemo} />;
}

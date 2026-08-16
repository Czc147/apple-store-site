import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { DEMO_ACTIVITIES } from '@/lib/demo-data';
import type { Activity } from '@/lib/types';
import DataError from '@/components/ui/DataError';
import ActivitiesClient from './ActivitiesClient';

/**
 * 服务端取数组件（配合 <Suspense> 流式渲染骨架屏）。
 * - 已配置 Supabase：读取 activities（sort_order 升序）
 * - 未配置：降级为演示数据（isDemo=true）
 * - 查询出错：DataError（可重试）
 */
export default async function ActivitiesServer() {
  let activities: Activity[];
  let isDemo = false;

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

  return <ActivitiesClient activities={activities} isDemo={isDemo} />;
}

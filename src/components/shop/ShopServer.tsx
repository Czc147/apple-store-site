import {
  supabaseAdmin,
  isSupabaseConfigured,
} from '@/lib/supabase/admin';
import { DEMO_MAJOR_UNITS, DEMO_SUB_UNITS } from '@/lib/demo-data';
import { toNumber } from '@/lib/format';
import type { MajorUnit, SubUnit } from '@/lib/types';
import DataError from '@/components/ui/DataError';
import ShopClient from './ShopClient';

/**
 * 服务端取数组件（配合 <Suspense> 流式渲染骨架屏）。
 * - 已配置 Supabase：读取 major_units / sub_units（各自按 sort_order 升序）
 * - 未配置：降级为演示数据（isDemo=true，页面显示提示条）
 * - 查询出错：渲染 DataError（可重试）
 */
export default async function ShopServer() {
  let majors: MajorUnit[];
  let subs: SubUnit[];
  let isDemo = false;

  if (!isSupabaseConfigured()) {
    majors = DEMO_MAJOR_UNITS;
    subs = DEMO_SUB_UNITS;
    isDemo = true;
  } else {
    try {
      const db = supabaseAdmin();
      const [majorsRes, subsRes] = await Promise.all([
        db
          .from('major_units')
          .select('id, name, image_url, link_url, sort_order')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        db
          .from('sub_units')
          .select('id, major_unit_id, name, sort_order, price, payment_url')
          .order('sort_order', { ascending: true }),
      ]);
      if (majorsRes.error) throw new Error(majorsRes.error.message);
      if (subsRes.error) throw new Error(subsRes.error.message);

      majors = (majorsRes.data ?? []) as MajorUnit[];
      // Supabase numeric 列返回字符串，边界处统一转 number
      subs = ((subsRes.data ?? []) as SubUnit[]).map((s) => ({
        ...s,
        price: toNumber(s.price),
      }));
    } catch (e) {
      return (
        <DataError
          message={e instanceof Error ? e.message : '商品数据加载失败'}
        />
      );
    }
  }

  // 小单元按大单元分组（接口已按 sort_order 排序，分组后顺序保持）
  const subsByMajor: Record<string, SubUnit[]> = {};
  for (const s of subs) {
    (subsByMajor[s.major_unit_id] ??= []).push(s);
  }

  // 大单元按 sort_order 升序（双重保险，兼容演示数据/旧数据）
  majors = [...majors].sort((a, b) => a.sort_order - b.sort_order);

  return <ShopClient majors={majors} subsByMajor={subsByMajor} isDemo={isDemo} />;
}

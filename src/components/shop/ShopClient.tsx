'use client';

import { ShoppingBag } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import type { MajorUnit, SubUnit } from '@/lib/types';
import MajorUnitCard from './MajorUnitCard';

interface ShopClientProps {
  majors: MajorUnit[];
  subsByMajor: Record<string, SubUnit[]>;
  isDemo: boolean;
}

/** 选购页主体：大单元卡片纵向列表（含演示数据提示条与空态） */
export default function ShopClient({
  majors,
  subsByMajor,
  isDemo,
}: ShopClientProps) {
  if (majors.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="暂无商品"
        description="商品还未上架。请先在 Supabase 后台或通过 /api/major-units 添加大单元商品。"
      />
    );
  }

  return (
    <div className="space-y-5 px-5">
      {isDemo && (
        <div className="rounded-card bg-apple-blue-soft px-4 py-3 text-[12.5px] leading-relaxed text-apple-blue">
          当前为演示数据 · 配置 SUPABASE 环境变量后将自动显示真实商品
        </div>
      )}
      {majors.map((major) => (
        <MajorUnitCard
          key={major.id}
          major={major}
          subs={subsByMajor[major.id] ?? []}
        />
      ))}
    </div>
  );
}

'use client';

import { ShoppingBag } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import type { MajorUnit, SubUnit, HomeSection } from '@/lib/types';
import MajorUnitCard from './MajorUnitCard';
import HomeSectionBlock from './HomeSectionBlock';

interface ShopClientProps {
  majors: MajorUnit[];
  subsByMajor: Record<string, SubUnit[]>;
  sections: HomeSection[];
  isDemo: boolean;
}

/**
 * 选购页主体：
 * - 未配置首页板块（sections 为空）→ 回退为两列网格（兼容老库）
 * - 已配置 → 按板块顺序渲染「标题 + 横向卡片流 / 网格」
 */
export default function ShopClient({
  majors,
  subsByMajor,
  sections,
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

  if (isDemo) {
    return (
      <div className="px-4 sm:px-5">
        <div className="mb-4 rounded-card bg-apple-blue-soft px-4 py-3 text-[12.5px] leading-relaxed text-apple-blue">
          当前为演示数据 · 配置 SUPABASE 环境变量后将自动显示真实商品
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {majors.map((major) => (
            <MajorUnitCard
              key={major.id}
              major={major}
              subs={subsByMajor[major.id] ?? []}
            />
          ))}
        </div>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="px-4 sm:px-5">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {majors.map((major) => (
            <MajorUnitCard
              key={major.id}
              major={major}
              subs={subsByMajor[major.id] ?? []}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {sections.map((section) => (
        <HomeSectionBlock
          key={section.id}
          section={section}
          majors={majors}
          subsByMajor={subsByMajor}
        />
      ))}
    </div>
  );
}

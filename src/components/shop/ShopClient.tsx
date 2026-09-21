'use client';

import { ShoppingBag } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import Message from '@/components/ui/Message';
import type { MajorUnit, SubUnit, HomeSection } from '@/lib/types';
import AlbumStackCard from './AlbumStackCard';
import HomeSectionBlock from './HomeSectionBlock';

interface ShopClientProps {
  majors: MajorUnit[];
  subsByMajor: Record<string, SubUnit[]>;
  sections: HomeSection[];
  isDemo: boolean;
}

/** 两列商品网格（audit 收敛：demo/回退/板块三处重复 JSX 合一） */
function MajorGrid({
  majors,
  subsByMajor,
}: {
  majors: MajorUnit[];
  subsByMajor: Record<string, SubUnit[]>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      {majors.map((major) => (
        <AlbumStackCard key={major.id} major={major} subs={subsByMajor[major.id] ?? []} />
      ))}
    </div>
  );
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
        description="商品正在筹备上架中，敬请期待。"
      />
    );
  }

  if (isDemo) {
    return (
      <div className="px-page">
        <Message tone="info" className="mb-4">
          当前为演示数据 · 配置 SUPABASE 环境变量后将自动显示真实商品
        </Message>
        <MajorGrid majors={majors} subsByMajor={subsByMajor} />
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="px-page">
        <MajorGrid majors={majors} subsByMajor={subsByMajor} />
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

'use client';

import type { MajorUnit, SubUnit, HomeSection } from '@/lib/types';
import SectionHeader from '@/components/ui/SectionHeader';
import AlbumStackCard from './AlbumStackCard';

interface HomeSectionBlockProps {
  section: HomeSection;
  majors: MajorUnit[];
  subsByMajor: Record<string, SubUnit[]>;
}

/**
 * 单个首页板块（editorial 分组 · UI 升级 §3.2 Studio Mist 带）：
 * 全宽 #f5f5f7 背景 + 内部白卡（专辑封面），大档区块标题 + 副标题 →
 * 横向滚动吸附卡片流 / 两列网格。gutter 统一 px-page。
 * 层级靠背景差异与圆角表达，不给卡片加重阴影。
 */
export default function HomeSectionBlock({
  section,
  majors,
  subsByMajor,
}: HomeSectionBlockProps) {
  const selectedIds = section.major_unit_ids ?? [];
  let items: MajorUnit[];
  if (selectedIds.length > 0) {
    const byId = new Map(majors.map((m) => [m.id, m]));
    items = selectedIds
      .map((id) => byId.get(id))
      .filter((m): m is MajorUnit => Boolean(m));
  } else {
    items = section.featured_only
      ? majors.filter((m) => m.featured === true)
      : majors;
  }

  if (items.length === 0) return null;

  return (
    <section aria-label={section.title} className="bg-apple-bg py-9 sm:py-12">
      <div className="px-page">
        <div className="mx-auto max-w-wide">
          <SectionHeader
            size="lg"
            title={section.title}
            subtitle={section.subtitle ?? undefined}
          />
        </div>
      </div>

      {section.layout === 'grid' ? (
        <div className="mx-auto grid max-w-wide grid-cols-2 gap-3 px-page sm:gap-5 lg:grid-cols-3 lg:gap-6">
          {items.map((major) => (
            <AlbumStackCard
              key={major.id}
              major={major}
              subs={subsByMajor[major.id] ?? []}
            />
          ))}
        </div>
      ) : (
        <div className="no-scrollbar mx-auto flex max-w-wide snap-x snap-mandatory gap-3 overflow-x-auto px-page sm:gap-5">
          {items.map((major) => (
            <div
              key={major.id}
              className="w-[78%] shrink-0 snap-center sm:w-[42%] lg:w-[30%]"
            >
              <AlbumStackCard
                major={major}
                subs={subsByMajor[major.id] ?? []}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

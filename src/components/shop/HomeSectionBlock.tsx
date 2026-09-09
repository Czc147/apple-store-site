'use client';

import type { MajorUnit, SubUnit, HomeSection } from '@/lib/types';
import SectionHeader from '@/components/ui/SectionHeader';
import MajorUnitCard from './MajorUnitCard';

interface HomeSectionBlockProps {
  section: HomeSection;
  majors: MajorUnit[];
  subsByMajor: Record<string, SubUnit[]>;
}

/**
 * 单个首页板块（editorial 分组）：大档区块标题 + 副标题 →
 * 横向滚动吸附卡片流 / 两列网格。gutter 统一 px-page（原 px-4 sm:px-5 手抄）。
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
    <section aria-label={section.title}>
      <div className="px-page">
        <SectionHeader
          size="lg"
          title={section.title}
          subtitle={section.subtitle ?? undefined}
        />
      </div>

      {section.layout === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 px-page sm:gap-4">
          {items.map((major) => (
            <MajorUnitCard
              key={major.id}
              major={major}
              subs={subsByMajor[major.id] ?? []}
            />
          ))}
        </div>
      ) : (
        <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-page">
          {items.map((major) => (
            <div
              key={major.id}
              className="w-[78%] shrink-0 snap-center sm:w-[42%]"
            >
              <MajorUnitCard
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

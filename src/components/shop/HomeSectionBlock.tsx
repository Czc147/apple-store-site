'use client';

import type { MajorUnit, SubUnit, HomeSection } from '@/lib/types';
import MajorUnitCard from './MajorUnitCard';

interface HomeSectionBlockProps {
  section: HomeSection;
  majors: MajorUnit[];
  subsByMajor: Record<string, SubUnit[]>;
}

/** 单个首页板块：标题 + 副标题 + 卡片（横向滚动吸附 / 两列网格） */
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
      <div className="px-4 sm:px-5">
        <h2 className="text-[22px] font-bold leading-tight tracking-tight text-apple-text">
          {section.title}
        </h2>
        {section.subtitle && (
          <p className="mt-1 text-[13px] text-apple-text-2">{section.subtitle}</p>
        )}
      </div>

      {section.layout === 'grid' ? (
        <div className="mt-3 grid grid-cols-2 gap-3 px-4 sm:gap-4 sm:px-5">
          {items.map((major) => (
            <MajorUnitCard
              key={major.id}
              major={major}
              subs={subsByMajor[major.id] ?? []}
            />
          ))}
        </div>
      ) : (
        <div className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:px-5">
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

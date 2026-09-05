'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { MajorUnit, SubUnit } from '@/lib/types';
import ActionSheet, { SheetItem } from '@/components/ui/ActionSheet';
import CardImage from './CardImage';
import SubUnitRow from './SubUnitRow';

interface MajorUnitCardProps {
  major: MajorUnit;
  subs: SubUnit[];
}

/**
 * 大单元卡片（两列网格版，对标 Apple Store 卡片）：
 * - 20px 圆角 · 轻阴影 · hover 上浮 · active 微缩
 * - 1:1 方图 + 粗体单元名 + 可选小单元数量
 * - 点击整卡打开 iOS 风格弹层：后台跳转链接 + 小单元列表
 *   （弹层不展示兑换商品——兑换内容仅在卡密兑换后出现）
 */
export default function MajorUnitCard({ major, subs }: MajorUnitCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-haspopup="dialog"
        aria-label={`查看「${major.name}」详情`}
        className="w-full overflow-hidden rounded-card border border-apple-border bg-apple-card text-left shadow-card hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.97] [transition:transform_100ms_cubic-bezier(0.4,0,0.2,1),box-shadow_200ms_cubic-bezier(0.4,0,0.2,1)]"
      >
        <div className="relative">
          <CardImage
            src={major.image_url}
            alt={major.name}
            square
            fallbackColor={major.cover_color ?? null}
          />
          {major.app_icon && (
            <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-white/80 text-[15px] leading-none shadow-sm backdrop-blur-sm">
              {/^https?:\/\//i.test(major.app_icon) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={major.app_icon}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                major.app_icon
              )}
            </span>
          )}
          {major.featured && (
            <span className="absolute right-2 top-2 rounded-full bg-apple-blue/90 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              精选
            </span>
          )}
        </div>
        <div className="px-3.5 pb-4 pt-3">
          <h2 className="truncate text-[14px] font-semibold tracking-tight text-apple-text sm:text-[15px]">
            {major.name}
          </h2>
          <p className="mt-0.5 truncate text-[12px] text-apple-text-3">
            {major.subtitle ||
              (subs.length > 0 ? `${subs.length} 个可选内容` : '点击查看')}
          </p>
        </div>
      </button>

      <ActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={major.name}
      >
        {major.link_url && (
          <div className="border-y border-apple-hairline">
            <SheetItem
              icon={ExternalLink}
              title="查看详情"
              subtitle="在新标签页打开链接"
              href={major.link_url}
            />
          </div>
        )}
        {subs.length > 0 ? (
          <ul className="divide-y divide-apple-hairline px-6">
            {subs.map((sub) => (
              <SubUnitRow key={sub.id} sub={sub} />
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-center text-[13px] text-apple-text-3">
            该单元下暂无可选小单元
          </p>
        )}
      </ActionSheet>
    </>
  );
}

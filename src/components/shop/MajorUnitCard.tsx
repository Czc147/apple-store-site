'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { MajorUnit, SubUnit } from '@/lib/types';
import ActionSheet, { SheetItem } from '@/components/ui/ActionSheet';
import Surface from '@/components/ui/Surface';
import Badge from '@/components/ui/Badge';
import CoverImage from '@/components/ui/CoverImage';
import SubUnitRow from './SubUnitRow';

interface MajorUnitCardProps {
  major: MajorUnit;
  subs: SubUnit[];
}

/**
 * 大单元卡片（对标 Apple Store 卡片）：
 * - Surface 卡壳（20px 圆角 · 轻阴影 · hover 上浮 · active 微缩，全走 token）
 * - 1:1 封面（CoverImage：shimmer 骨架 + 失败回退 cover_color/浅渐变）
 * - 图标芯片 + 精选角标（blue-on-image 实心档）
 * - 点击整卡打开 iOS 风格弹层：后台跳转链接 + 小单元列表
 *   （弹层不展示兑换商品——兑换内容仅在卡密兑换后出现）
 */
export default function MajorUnitCard({ major, subs }: MajorUnitCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <Surface
        as="button"
        interactive
        onClick={() => setSheetOpen(true)}
        aria-label={`查看「${major.name}」详情`}
        className="w-full overflow-hidden text-left"
      >
        <div className="relative">
          <CoverImage
            src={major.image_url}
            alt={major.name}
            ratio="square"
            fallbackStyle={major.cover_color ? { background: major.cover_color } : undefined}
            sizes="(min-width: 768px) 33vw, 50vw"
          />
          {major.app_icon && (
            <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center overflow-hidden rounded-chip bg-white/80 text-md leading-none shadow-card backdrop-blur-sm">
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
            <span className="absolute right-2 top-2">
              <Badge tone="blue-on-image" size="sm">
                精选
              </Badge>
            </span>
          )}
        </div>
        <div className="px-3.5 pb-4 pt-3">
          <h2 className="truncate text-base font-semibold tracking-tight text-apple-text sm:text-md">
            {major.name}
          </h2>
          <p className="mt-0.5 truncate text-xs text-apple-text-3">
            {major.subtitle ||
              (subs.length > 0 ? `${subs.length} 个可选内容` : '点击查看')}
          </p>
        </div>
      </Surface>

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
          <p className="px-5 py-6 text-center text-sm text-apple-text-3">
            该单元下暂无可选小单元
          </p>
        )}
      </ActionSheet>
    </>
  );
}

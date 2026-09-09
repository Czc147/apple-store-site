'use client';

import { useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import type { Activity } from '@/lib/types';
import ActionSheet, { SheetItem } from '@/components/ui/ActionSheet';
import Surface from '@/components/ui/Surface';
import CoverImage from '@/components/ui/CoverImage';

/** 旧数据无 title 时，回退到 description 首行作为卡片标题 */
function resolveTitle(activity: Activity): string | null {
  const t = activity.title?.trim();
  if (t) return t;
  const firstLine = activity.description?.split(/\r?\n/)[0]?.trim();
  return firstLine || null;
}

/**
 * 活动卡 = 全站统一 Featured Content Card（Brief §13.3，对标 Apple Store Today）：
 * - Surface 卡壳（20px 圆角 · hover 上浮 · active 微缩，手写 transition 清除）
 * - 4:3 封面（CoverImage：shimmer 骨架 + 失败回退 token 渐变，私有 hex 清除）
 * - 图底 scrim 渐变遮罩 + 白色粗体标题
 * - 图下介绍（2 行省略）+ 「了解更多 ›」
 * - 点击整卡打开弹层：完整介绍 + 跳转链接
 */
export default function ActivityCard({ activity }: { activity: Activity }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const title = resolveTitle(activity);
  const href = activity.link_url;

  return (
    <>
      <Surface
        as="button"
        interactive
        onClick={() => setSheetOpen(true)}
        aria-label={`查看「${title ?? '活动'}」详情`}
        className="w-full overflow-hidden text-left"
      >
        {/* ---------- 大图区 ---------- */}
        <CoverImage
          src={activity.image_url}
          alt={title ?? '活动图片'}
          ratio="photo"
          sizes="(min-width: 640px) 45vw, 100vw"
          overlay={
            title ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-apple-scrim-image via-apple-scrim/60 to-transparent px-3.5 pb-3 pt-10">
                <h2 className="line-clamp-2 text-md font-bold leading-snug tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]">
                  {title}
                </h2>
              </div>
            ) : undefined
          }
        />

        {/* ---------- 文字区 ---------- */}
        <div className="px-3.5 pb-4 pt-3">
          {activity.description && (
            <p className="line-clamp-2 text-xs leading-relaxed text-apple-text-2">
              {activity.description}
            </p>
          )}
          {href && (
            <span className="mt-2 inline-flex items-center gap-px text-xs font-medium text-apple-blue">
              了解更多
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
            </span>
          )}
        </div>
      </Surface>

      <ActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={title ?? '活动详情'}
      >
        {activity.description && (
          <p className="whitespace-pre-line px-6 pb-4 text-sm leading-relaxed text-apple-text-2">
            {activity.description}
          </p>
        )}
        {href ? (
          <div className="border-t border-apple-hairline">
            <SheetItem
              icon={ExternalLink}
              title="了解更多"
              subtitle="在新标签页打开链接"
              href={href}
            />
          </div>
        ) : (
          !activity.description && (
            <p className="px-6 py-6 text-center text-sm text-apple-text-3">
              暂无活动详情
            </p>
          )
        )}
      </ActionSheet>
    </>
  );
}

'use client';

import { useState } from 'react';
import { CalendarDays, ChevronRight, ExternalLink } from 'lucide-react';
import type { Activity } from '@/lib/types';
import ActionSheet, { SheetItem } from '@/components/ui/ActionSheet';

/** 旧数据无 title 时，回退到 description 首行作为卡片标题 */
function resolveTitle(activity: Activity): string | null {
  const t = activity.title?.trim();
  if (t) return t;
  const firstLine = activity.description?.split(/\r?\n/)[0]?.trim();
  return firstLine || null;
}

/**
 * 活动卡片（两列网格版，对标 Apple Store Today 页）：
 * - 20px 圆角 · 4:3 图 · 图片底部渐变遮罩 + 白色粗体标题
 * - 图下活动介绍（最多 2 行省略）+ 「了解更多 ›」
 * - 点击整卡打开 iOS 风格弹层：活动介绍 + 跳转链接
 *   （弹层不展示兑换商品——兑换内容仅在卡密兑换后出现）
 */
export default function ActivityCard({ activity }: { activity: Activity }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const title = resolveTitle(activity);
  const href = activity.link_url;
  const showImage = Boolean(activity.image_url) && !failed;

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-haspopup="dialog"
        aria-label={`查看「${title ?? '活动'}」详情`}
        className="w-full overflow-hidden rounded-card border border-apple-border bg-apple-card text-left shadow-card hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.97] [transition:transform_100ms_cubic-bezier(0.4,0,0.2,1),box-shadow_200ms_cubic-bezier(0.4,0,0.2,1)]"
      >
        {/* ---------- 大图区 ---------- */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-apple-bg">
          {showImage ? (
            <>
              {!loaded && <div className="skeleton absolute inset-0" aria-hidden />}
              <img
                src={activity.image_url!}
                alt={title ?? '活动图片'}
                loading="lazy"
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
                className={`h-full w-full object-cover transition-opacity duration-300 ${
                  loaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </>
          ) : (
            /* 无图 / 加载失败：占位色块 */
            <div
              className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#E9F1FB] to-[#DBE4F3]"
              aria-hidden
            >
              <CalendarDays className="h-8 w-8 text-apple-text-3/50" strokeWidth={1.4} />
            </div>
          )}

          {/* 渐变遮罩 + 标题（叠加在图片上） */}
          {title && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent px-3.5 pb-3 pt-10">
              <h2 className="line-clamp-2 text-[15px] font-bold leading-snug tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]">
                {title}
              </h2>
            </div>
          )}
        </div>

        {/* ---------- 文字区 ---------- */}
        <div className="px-3.5 pb-4 pt-3">
          {activity.description && (
            <p className="line-clamp-2 text-[12px] leading-relaxed text-apple-text-2">
              {activity.description}
            </p>
          )}
          {href && (
            <span className="mt-2 inline-flex items-center gap-px text-[12.5px] font-medium text-apple-blue">
              了解更多
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
            </span>
          )}
        </div>
      </button>

      <ActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={title ?? '活动详情'}
      >
        {activity.description && (
          <p className="whitespace-pre-line px-6 pb-4 text-[13.5px] leading-relaxed text-apple-text-2">
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
            <p className="px-6 py-6 text-center text-[13px] text-apple-text-3">
              暂无活动详情
            </p>
          )
        )}
      </ActionSheet>
    </>
  );
}

'use client';

import { useState } from 'react';
import { CalendarDays, ChevronRight } from 'lucide-react';
import type { Activity } from '@/lib/types';

/** 旧数据无 title 时，回退到 description 首行作为卡片标题 */
function resolveTitle(activity: Activity): string | null {
  const t = activity.title?.trim();
  if (t) return t;
  const firstLine = activity.description?.split(/\r?\n/)[0]?.trim();
  return firstLine || null;
}

/**
 * 活动大卡片（对标 Apple Store Today 页）：
 * - 24px 超大圆角 · 16:9 大图圆角裁切
 * - 图片底部渐变遮罩 + 白色粗体标题
 * - 图下活动介绍（最多 3 行省略）
 * - 「了解更多 ›」蓝色文字链
 * - 整卡可点（stretched link，新标签页打开 link_url）
 * - hover 上浮 / active 按压缩小微动效
 */
export default function ActivityCard({ activity }: { activity: Activity }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const title = resolveTitle(activity);
  const href = activity.link_url;
  const showImage = Boolean(activity.image_url) && !failed;

  return (
    <article className="relative overflow-hidden rounded-card-lg border border-apple-border bg-apple-card shadow-card hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.98] [transition:transform_100ms_cubic-bezier(0.4,0,0.2,1),box-shadow_200ms_cubic-bezier(0.4,0,0.2,1)]">
      {/* ---------- 大图区 ---------- */}
      <div className="relative aspect-video w-full overflow-hidden bg-apple-bg">
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
            <CalendarDays className="h-10 w-10 text-apple-text-3/50" strokeWidth={1.4} />
          </div>
        )}

        {/* 渐变遮罩 + 标题（叠加在图片上） */}
        {title && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent px-5 pb-4 pt-14">
            <h2 className="text-[19px] font-bold leading-snug tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]">
              {title}
            </h2>
          </div>
        )}
      </div>

      {/* ---------- 文字区 ---------- */}
      <div className="px-5 pb-5 pt-4">
        {activity.description && (
          <p className="line-clamp-3 text-[14px] leading-relaxed text-apple-text-2">
            {activity.description}
          </p>
        )}
        {href && (
          <span className="mt-3 inline-flex items-center gap-px text-[14px] font-medium text-apple-blue">
            了解更多
            <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </span>
        )}
      </div>

      {/* stretched link：点击卡片任意位置跳转（无链接时不可点） */}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${title ?? '活动'}（在新标签页打开）`}
          className="absolute inset-0 rounded-card-lg"
        />
      )}
    </article>
  );
}

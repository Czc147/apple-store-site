'use client';

import { useMemo, useState } from 'react';
import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Video,
  X,
} from 'lucide-react';
import { classifyMedia } from '@/lib/upload';

/** 「我的内容」卡片所需的最小字段（服务端权益行与本机记录皆满足） */
export interface ContentItem {
  id: string;
  name: string | null;
  description: string | null;
  media_url: string | null;
}

type Kind = 'image' | 'video' | 'doc' | 'other';
type Tab = 'all' | 'image' | 'video' | 'doc';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
  { key: 'doc', label: '文档' },
];

/** 按 media_url 归类；无媒体或未知扩展名 → other（可视为卡密/纯文字内容） */
function kindOf(item: ContentItem): Kind {
  if (!item.media_url) return 'other';
  return classifyMedia(item.media_url);
}

const TAB_ACTIVE =
  'flex-none rounded-full bg-apple-blue px-3.5 py-1.5 text-[13px] font-medium text-white transition';
const TAB_NORMAL =
  'flex-none rounded-full border border-apple-border bg-white px-3.5 py-1.5 text-[13px] font-medium text-apple-text-2 transition hover:bg-apple-bg';

/**
 * 「我的内容」：类型 Tab（全部/图片/视频/文档）+ 混合排版。
 * 图片走 2 列网格（object-contain 不裁剪，点击全屏预览）；视频/文档走行卡。
 */
export default function ContentsView({ contents }: { contents: ContentItem[] }) {
  const [tab, setTab] = useState<Tab>('all');
  const [lightbox, setLightbox] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      contents.filter((c) => {
        const k = kindOf(c);
        if (tab === 'all') return true;
        if (tab === 'doc') return k === 'doc' || k === 'other';
        return k === tab;
      }),
    [contents, tab],
  );

  const images = filtered.filter((c) => kindOf(c) === 'image');
  const rows = filtered.filter((c) => kindOf(c) !== 'image');

  return (
    <div>
      {/* 类型 Tab */}
      <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={tab === t.key ? TAB_ACTIVE : TAB_NORMAL}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-apple-text-3">
          该分类下暂无内容
        </p>
      ) : (
        <>
          {/* 图片：2 列网格 */}
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {images.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setLightbox(c.media_url)}
                  className="group overflow-hidden rounded-card border border-apple-border bg-apple-card text-left shadow-card transition hover:border-apple-blue/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.media_url as string}
                    alt={c.name ?? '图片'}
                    loading="lazy"
                    className="aspect-square w-full bg-apple-bg object-contain"
                  />
                  <p className="truncate px-2.5 py-2 text-center text-[12px] text-apple-text-2">
                    {c.name ?? '图片'}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* 视频 / 文档 / 内容：行卡 */}
          {rows.length > 0 && (
            <div className={images.length > 0 ? 'mt-3 space-y-2.5' : 'space-y-2.5'}>
              {rows.map((c) => (
                <RowCard key={c.id} item={c} />
              ))}
            </div>
          )}
        </>
      )}

      {/* 图片全屏预览 */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            aria-label="关闭预览"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="预览大图"
            className="max-h-[85dvh] max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
}

/** 视频 / 文档 / 纯内容 行卡 */
function RowCard({ item }: { item: ContentItem }) {
  const kind = kindOf(item);
  const Icon = kind === 'video' ? Video : kind === 'doc' ? FileText : ImageIcon;
  const label = kind === 'video' ? '视频' : kind === 'doc' ? '文档' : '内容';

  return (
    <div className="flex items-center gap-3 rounded-card border border-apple-border bg-apple-card px-3.5 py-3 shadow-card">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-card bg-apple-bg">
        <Icon className="h-5 w-5 text-apple-text-3" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-apple-text">
          {item.name ?? label}
        </p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-apple-text-2">
            {item.description}
          </p>
        )}
      </div>
      {item.media_url && kind !== 'image' && (
        <a
          href={item.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
        >
          打开
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}
    </div>
  );
}

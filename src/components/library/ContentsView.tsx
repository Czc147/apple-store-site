'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Inbox,
  Video,
  X,
} from 'lucide-react';
import { classifyMedia } from '@/lib/upload';
import EmptyState from '@/components/ui/EmptyState';
import IconButton from '@/components/ui/IconButton';
import ListRow from '@/components/ui/ListRow';
import ExternalLinkAction from '@/components/ui/ExternalLinkAction';
import { cn } from '@/lib/cn';

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

/**
 * 「我的内容」：类型 Tab（全部/图片/视频/文档）+ 混合排版。
 * 图片走 2 列网格（object-contain 不裁剪，点击全屏预览）；视频/文档走 ListRow。
 * audit 收敛：Tab 命中 33px → 44pt；lightbox 遮罩/z/关闭钮走 token +
 * IconButton(on-dark) + 补 Esc 关闭；行卡 → ListRow primitive；
 * 分类空态裸文字 → EmptyState(inline)。
 */
export default function ContentsView({ contents }: { contents: ContentItem[] }) {
  const [tab, setTab] = useState<Tab>('all');
  const [lightbox, setLightbox] = useState<string | null>(null);

  // lightbox 打开时支持 Esc 关闭（原本只能点击关闭）
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

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
      {/* 类型 Tab：命中 44pt（负边距补偿，行高视觉不变） */}
      <div className="no-scrollbar -my-1.5 mb-1.5 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={cn(
              'flex-none rounded-btn px-4 text-sm font-medium',
              'inline-flex min-h-11 items-center',
              'transition-colors duration-fast ease-apple active:scale-[0.97]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40',
              tab === t.key
                ? 'bg-apple-blue text-white'
                : 'border border-apple-border bg-white text-apple-text-2 hover:bg-apple-bg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          size="inline"
          title="该分类下暂无内容"
          description="切换到「全部」看看其他类型的内容。"
        />
      ) : (
        <>
          {/* 图片：2 列网格（object-contain 完整展示，不走 CoverImage 的 cover 裁剪） */}
          {images.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {images.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setLightbox(c.media_url)}
                  aria-label={`全屏预览「${c.name ?? '图片'}」`}
                  className="group overflow-hidden rounded-card border border-apple-border bg-apple-card text-left shadow-card transition-[transform,box-shadow,border-color] duration-base ease-apple hover:border-apple-blue/40 hover:shadow-card-hover active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.media_url as string}
                    alt={c.name ?? '图片'}
                    loading="lazy"
                    className="aspect-square w-full bg-apple-bg object-contain"
                  />
                  <p className="truncate px-2.5 py-2 text-center text-xs text-apple-text-2">
                    {c.name ?? '图片'}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* 视频 / 文档 / 内容：ListRow 行卡 */}
          {rows.length > 0 && (
            <div className={cn('space-y-2.5', images.length > 0 && 'mt-3')}>
              {rows.map((c) => (
                <RowCard key={c.id} item={c} />
              ))}
            </div>
          )}
        </>
      )}

      {/* 图片全屏预览：z-lightbox + scrim-lightbox token + on-dark 关闭钮(44pt) */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="图片全屏预览"
          className="scrim-lightbox animate-fade-in fixed inset-0 z-lightbox flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <IconButton
            icon={X}
            label="关闭预览"
            variant="on-dark"
            iconSize="md"
            onClick={() => setLightbox(null)}
            className="absolute right-2 top-2"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="预览大图"
            className="max-h-[85dvh] max-w-full rounded-input object-contain"
          />
        </div>
      )}
    </div>
  );
}

/** 视频 / 文档 / 纯内容 行卡（ListRow：图标芯片 + 标题/描述 + 外链动作） */
function RowCard({ item }: { item: ContentItem }) {
  const kind = kindOf(item);
  const Icon = kind === 'video' ? Video : kind === 'doc' ? FileText : ImageIcon;
  const label = kind === 'video' ? '视频' : kind === 'doc' ? '文档' : '内容';

  return (
    <div className="overflow-hidden rounded-card border border-apple-border bg-apple-card shadow-card">
      <ListRow
        padding="card"
        leading={
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-chip bg-apple-bg">
            <Icon className="h-5 w-5 text-apple-text-3" aria-hidden />
          </span>
        }
        title={item.name ?? label}
        subtitle={item.description ?? undefined}
        trailing={
          item.media_url && kind !== 'image' ? (
            <ExternalLinkAction href={item.media_url}>打开</ExternalLinkAction>
          ) : undefined
        }
      />
    </div>
  );
}

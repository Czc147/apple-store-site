'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText,
  Image as ImageIcon,
  Inbox,
  StickyNote,
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
  /** 统一备注（后台推送的全局备注，迁移 021）；游客本机记录无此字段 */
  note?: string | null;
  media_url: string | null;
}

type Kind = 'image' | 'video' | 'doc' | 'other' | 'text';
type Tab = 'all' | 'image' | 'video' | 'doc';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
  { key: 'doc', label: '文档' },
];

/**
 * 按 media_url 归类；无附件（media_url 为空）→ text 纯文字内容。
 * text 只出现在「全部」（没有文件可归类），其余走扩展名分类。
 */
function kindOf(item: ContentItem): Kind {
  if (!item.media_url) return 'text';
  return classifyMedia(item.media_url);
}

/**
 * 「我的内容」：类型 Tab（全部/图片/视频/文档）+ 混合排版。
 * - 图片走 2 列网格（object-contain 不裁剪，点击全屏预览，预览里带名称/说明/备注）
 * - 纯文字内容（无附件）走整块文字卡，只归入「全部」，展示说明与备注全文
 * - 视频/文档走 ListRow（subtitle 显示 description，下方备注块显示统一备注）
 * audit 收敛：Tab 命中 33px → 44pt；lightbox 遮罩/z/关闭钮走 token +
 * IconButton(on-dark) + 补 Esc 关闭；行卡 → ListRow primitive；
 * 分类空态裸文字 → EmptyState(inline)。
 */
export default function ContentsView({ contents }: { contents: ContentItem[] }) {
  const [tab, setTab] = useState<Tab>('all');
  const [lightbox, setLightbox] = useState<ContentItem | null>(null);
  // Portal 挂载标记：SSR 无 document.body 可挂
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
        // 纯文字内容没有文件类型，只归入「全部」
        if (k === 'text') return false;
        if (tab === 'doc') return k === 'doc' || k === 'other';
        return k === tab;
      }),
    [contents, tab],
  );

  const images = filtered.filter((c) => kindOf(c) === 'image');
  const texts = filtered.filter((c) => kindOf(c) === 'text');
  const rows = filtered.filter((c) => {
    const k = kindOf(c);
    return k === 'video' || k === 'doc' || k === 'other';
  });

  const hasDetails = Boolean(lightbox?.name || lightbox?.description || lightbox?.note);

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
                : 'border border-apple-border bg-apple-card text-apple-text-2 hover:bg-apple-bg',
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
                  onClick={() => setLightbox(c)}
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

          {/* 纯文字内容：整块文字卡（说明与备注全文，无「打开」） */}
          {texts.length > 0 && (
            <div className={cn('space-y-2.5', images.length > 0 && 'mt-3')}>
              {texts.map((c) => (
                <TextCard key={c.id} item={c} />
              ))}
            </div>
          )}

          {/* 视频 / 文档 / 内容：ListRow 行卡 */}
          {rows.length > 0 && (
            <div
              className={cn(
                'space-y-2.5',
                (images.length > 0 || texts.length > 0) && 'mt-3',
              )}
            >
              {rows.map((c) => (
                <RowCard key={c.id} item={c} />
              ))}
            </div>
          )}
        </>
      )}

      {/* 图片全屏预览：Portal 到 body（与 BottomSheet 同款）——脱离页面内容层，
          fixed 才真正贴视口；z-lightbox + scrim-lightbox token + on-dark 关闭钮(44pt) */}
      {mounted && lightbox && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name ? `${lightbox.name} 全屏预览` : '图片全屏预览'}
          className="scrim-lightbox animate-fade-in fixed inset-0 z-lightbox flex flex-col items-center justify-center gap-3 p-4"
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
          {/* 图片与详情成组居中：图片不撑满（否则小图时详情被推到屏幕底部，中间留大段空白） */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.media_url as string}
            alt={lightbox.name ?? '预览大图'}
            className={cn(
              'w-auto max-w-full rounded-input object-contain',
              hasDetails ? 'max-h-[68dvh]' : 'max-h-[85dvh]',
            )}
          />
          {/* 详情区：图片网格卡原本完全不显示说明/备注，这里补上（点击不关闭预览） */}
          {hasDetails && (
            <div
              className="max-h-[30dvh] w-full max-w-md flex-none overflow-y-auto text-center"
              onClick={(e) => e.stopPropagation()}
            >
              {lightbox.name && (
                <p className="text-md font-semibold text-white">{lightbox.name}</p>
              )}
              {lightbox.description && (
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-white/85">
                  {lightbox.description}
                </p>
              )}
              {lightbox.note && (
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-white/70">
                  备注：{lightbox.note}
                </p>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** 统一备注块（行卡与纯文字卡共用）：全文展示，不截断 */
function NoteBlock({ note, className }: { note: string; className?: string }) {
  return (
    <p
      className={cn(
        'whitespace-pre-wrap rounded-input bg-apple-bg px-3 py-2 text-xs leading-relaxed text-apple-text-2',
        className,
      )}
    >
      备注：{note}
    </p>
  );
}

/** 视频 / 文档 / 纯内容 行卡（ListRow：图标芯片 + 标题/描述 + 外链动作 + 备注块） */
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
      {item.note && <NoteBlock note={item.note} className="mx-4 mb-3" />}
    </div>
  );
}

/** 纯文字内容卡（无附件）：名称 + 说明全文 + 备注全文，没有「打开」入口 */
function TextCard({ item }: { item: ContentItem }) {
  return (
    <div className="rounded-card border border-apple-border bg-apple-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-chip bg-apple-bg">
          <StickyNote className="h-5 w-5 text-apple-text-3" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-md font-medium text-apple-text">{item.name ?? '内容'}</p>
          {item.description && (
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-apple-text-2">
              {item.description}
            </p>
          )}
        </div>
      </div>
      {item.note && <NoteBlock note={item.note} className="mt-3" />}
    </div>
  );
}

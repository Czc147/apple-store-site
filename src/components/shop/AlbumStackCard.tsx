'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ExternalLink, X } from 'lucide-react';
import type { MajorUnit, SubUnit } from '@/lib/types';
import { formatPrice } from '@/lib/format';
import CoverImage from '@/components/ui/CoverImage';
import Badge from '@/components/ui/Badge';
import IconButton from '@/components/ui/IconButton';
import ExternalLinkAction from '@/components/ui/ExternalLinkAction';
import SubUnitRow from './SubUnitRow';
import { cn } from '@/lib/cn';

interface AlbumStackCardProps {
  major: MajorUnit;
  subs: SubUnit[];
}

/** 展开/收起动效时长（§5.4：封面 320–420ms，关闭 280–360ms） */
const OPEN_MS = 380;
const CLOSE_MS = 300;
const EASE_COVER = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** 系统「减弱动态效果」：不做封面飞行，只淡入淡出（§5.7 / §9.6） */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 专辑式大单元卡（UI 升级 §5）：
 * - 收起态：封面像专辑一样前后层叠（后层缩放 88%/94% + 轻透视 + 下沉），
 *   下方是名称 / 一句简介（副标题或「N 个可选内容」）/ 展开箭头
 * - 点击：封面从原位 FLIP 到屏幕上方舞台（只动 transform/opacity），
 *   小单元行按 40ms stagger 依次滑入；背景压暗形成专注层
 * - 关闭：逆动画，滚动位置天然保留（展开期间锁定 body 滚动）
 * - 可访问性：卡本身是 button（aria-expanded / aria-haspopup），Escape 关闭，
 *   打开后焦点进面板、关闭后焦点回原卡；reduced-motion 下退化为淡入淡出
 * 数据不变：封面用后台上传字段，堆叠层数/透视由前端视觉规则决定。
 */
export default function AlbumStackCard({ major, subs }: AlbumStackCardProps) {
  const [open, setOpen] = useState(false);
  // Portal 挂载标记（SSR 无 document.body）
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /** 收起态封面元素（FLIP 起点测量） */
  const cardCoverRef = useRef<HTMLDivElement>(null);
  /** 展开态封面舞台（FLIP 终点 / 逆动画起点） */
  const stageRef = useRef<HTMLDivElement>(null);
  const cardButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** 打开瞬间记下的收起态封面 rect（关闭时用它算逆变换） */
  const fromRectRef = useRef<DOMRect | null>(null);

  const hasSubs = subs.length > 0;
  const minPrice = hasSubs
    ? Math.min(...subs.map((s) => Number(s.price) || 0))
    : null;

  /** 打开后的 FLIP：从收起态封面 rect 飞到舞台 rect */
  useEffect(() => {
    if (!open) return;
    const stage = stageRef.current;
    const from = fromRectRef.current;
    if (!stage || !from || prefersReducedMotion()) return;
    const to = stage.getBoundingClientRect();
    if (to.width === 0) return;
    const scale = from.width / to.width;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    stage.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.85 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: OPEN_MS, easing: EASE_COVER },
    );
  }, [open]);

  const handleOpen = () => {
    fromRectRef.current = cardCoverRef.current?.getBoundingClientRect() ?? null;
    setOpen(true);
  };

  const handleClose = useCallback(() => {
    const stage = stageRef.current;
    const from = fromRectRef.current;
    if (!stage || !from || prefersReducedMotion()) {
      setOpen(false);
      return;
    }
    const to = stage.getBoundingClientRect();
    const scale = from.width / to.width;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const anim = stage.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.2 },
      ],
      { duration: CLOSE_MS, easing: EASE_COVER },
    );
    anim.onfinish = () => setOpen(false);
    anim.oncancel = () => setOpen(false);
  }, []);

  /** 展开期间：锁 body 滚动 + Escape 关闭 + 焦点管理（§5.7） */
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      // 关闭后焦点回原卡（滚动位置未动，浏览器无需重新定位）
      cardButtonRef.current?.focus({ preventScroll: true });
    };
  }, [open, handleClose]);

  return (
    <>
      {/* ---------- 收起态：专辑层叠卡 ---------- */}
      <button
        ref={cardButtonRef}
        type="button"
        onClick={handleOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`展开「${major.name}」${hasSubs ? `（${subs.length} 个可选内容）` : ''}`}
        className="group w-full text-left focus-visible:outline-none"
      >
        <div className="relative">
          {/* 后层封面：与前封面同高、左右收窄、向下平移，只露出下方窄边形成层叠。
              注意用 top-0 + h-full（= 前封面高度），不要包住下方文字区 */}
          <div
            aria-hidden
            className="absolute inset-x-4 top-0 h-full translate-y-3 rounded-hero bg-apple-card shadow-stack ring-1 ring-black/5"
          />
          <div
            aria-hidden
            className="absolute inset-x-2 top-0 h-full translate-y-1.5 rounded-hero bg-apple-card shadow-stack ring-1 ring-black/5"
          />
          {/* 前封面 */}
          <div
            ref={cardCoverRef}
            className={cn(
              'relative overflow-hidden rounded-hero bg-apple-card ring-1 ring-black/5',
              'transition-transform duration-slow ease-apple',
              'group-hover:-translate-y-0.5 group-active:scale-[0.98]',
            )}
          >
            <CoverImage
              src={major.image_url}
              alt={major.name}
              ratio="album"
              fallbackStyle={major.cover_color ? { background: major.cover_color } : undefined}
              sizes="(min-width: 768px) 33vw, 45vw"
            />
            {major.app_icon && (
              <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center overflow-hidden rounded-chip bg-white/80 text-md leading-none shadow-card backdrop-blur-sm">
                {/^https?:\/\//i.test(major.app_icon) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={major.app_icon} alt="" className="h-full w-full object-cover" />
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
        </div>

        <div className="mt-5 px-0.5">
          <h2 className="truncate text-md font-semibold text-apple-text">{major.name}</h2>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-apple-text-2">
            <span className="truncate">
              {major.subtitle || (hasSubs ? `${subs.length} 个可选内容` : '点击查看')}
            </span>
            <ChevronRight
              className="h-3.5 w-3.5 flex-none text-apple-text-3 transition-transform duration-fast ease-apple group-hover:translate-x-0.5"
              aria-hidden
            />
          </p>
        </div>
      </button>

      {/* ---------- 展开态：封面舞台 + 小单元列表 ---------- */}
      {mounted && open && createPortal(
        <div className="fixed inset-0 z-sheet flex flex-col" role="dialog" aria-modal="true" aria-label={`${major.name} 可选内容`}>
          {/* 背景压暗（§5.3 专注层） */}
          <div
            className="scrim-sheet absolute inset-0 animate-fade-in"
            onClick={handleClose}
            aria-hidden
          />

          <div className="relative flex h-full flex-col overflow-y-auto overscroll-contain px-page pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+16px)] sm:items-center">
            <IconButton
              icon={X}
              label="关闭"
              variant="on-dark"
              iconSize="md"
              onClick={handleClose}
              className="absolute right-3 top-3 z-10"
            />

            {/* 封面舞台：移动端 88% 宽、桌面 420px；封面与信息在桌面分栏 */}
            <div className="mx-auto w-full max-w-wide sm:mt-6 sm:flex sm:items-start sm:gap-8 sm:px-2">
              <div className="mx-auto w-[86%] sm:mx-0 sm:w-[420px] sm:flex-none">
                <div
                  ref={stageRef}
                  className="overflow-hidden rounded-hero bg-apple-card shadow-stack ring-1 ring-black/5"
                  style={{ willChange: 'transform' }}
                >
                  <CoverImage
                    src={major.image_url}
                    alt={major.name}
                    ratio="album"
                    fallbackStyle={major.cover_color ? { background: major.cover_color } : undefined}
                    sizes="(min-width: 640px) 420px, 86vw"
                    priority
                  />
                </div>
              </div>

              {/* 信息与列表 */}
              <div
                ref={panelRef}
                tabIndex={-1}
                className="mt-5 flex-1 focus:outline-none sm:mt-0"
              >
                <h2 className="text-xl font-semibold text-apple-text">{major.name}</h2>
                {major.subtitle && (
                  <p className="mt-1.5 text-base leading-relaxed text-apple-text-2">
                    {major.subtitle}
                  </p>
                )}
                {minPrice !== null && (
                  <p className="mt-2 text-sm tabular-nums text-apple-text-2">
                    {subs.length} 个可选内容 · 起 {formatPrice(minPrice)}
                  </p>
                )}
                {major.link_url && (
                  <div className="mt-3">
                    <ExternalLinkAction href={major.link_url}>查看详情</ExternalLinkAction>
                  </div>
                )}

                {hasSubs ? (
                  <ul className="mt-2 divide-y divide-apple-hairline rounded-card-lg bg-apple-card px-4 shadow-card sm:mt-4">
                    {subs.map((sub, i) => (
                      <li
                        key={sub.id}
                        className="animate-rise"
                        style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                      >
                        <SubUnitRow sub={sub} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-6 rounded-card-lg bg-apple-card px-5 py-6 text-center text-sm text-apple-text-3 shadow-card">
                    该单元下暂无可选小单元
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

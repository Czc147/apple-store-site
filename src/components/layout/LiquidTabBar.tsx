'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import LiquidGlassFilter from './LiquidGlassFilter';
import { cn } from '@/lib/cn';

/** 玻璃罩比药丸四周各大这么多 px —— 多出来的一圈就是"罩"的可见边缘 */
const DOME_INSET = 5;
/** 按下时的增强色散层位移强度（正常为 -0.94，见 liquid-glass.ts） */
const DOME_BOOST_STRENGTH = -2.1;

export interface LiquidTabItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** 给了 href 就渲染成 Link（路由跳转），否则用 onClick（页内切板块） */
  href?: string;
  onClick?: () => void;
  /** 图标右上角的角标（如未读数） */
  badge?: ReactNode;
  /** 激活时叠在图标上的覆盖层（主 TabBar 的彩虹反射用） */
  overlay?: ReactNode;
}

/** 右侧额外挂的圆形动作按钮（探究广场的搜索胶囊） */
export interface LiquidTabAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
}

interface LiquidTabBarProps {
  items: LiquidTabItem[];
  /** 当前激活项的 key；传 null 表示没有激活项（如搜索面板打开时） */
  activeKey: string | null;
  ariaLabel: string;
  /** 是否响应 prefers-reduced-motion（由调用方传入，避免每个实例各自监听） */
  reducedMotion?: boolean;
  /** 行尾额外挂的圆形动作钮（探究广场的搜索胶囊，形态与文字 Tab 不同） */
  action?: LiquidTabAction;
}

/**
 * 滤镜 id **刻意写死共享**，不是每个实例各自一份。
 *
 * 原因：`backdrop-filter: url(#id)` 的 id 必须写进 CSS 的 `@supports`
 * 与 `.liquid-pill__refract` 规则里，而 CSS 没法按实例拼 id —— 试过按实例
 * 传前缀，结果广场那栏引用了主 TabBar 的滤镜 id，折射直接失效（实测
 * computed style 里是 `url("#liquid-pill-filter")`，而广场页根本没有这个元素）。
 *
 * 共享是安全的：主 TabBar 在 `(store)` 布局、广场板块栏在 `(plaza)` 布局，
 * **一个路由只会挂其中一套**，两套不会同时存在于同一页。
 */
const PILL_FILTER_ID = 'liquid-pill-filter';
const DOME_FILTER_ID = 'liquid-dome-filter';
const DOME_BOOST_FILTER_ID = 'liquid-dome-boost-filter';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 液态玻璃底栏（主 TabBar 与探究广场板块栏共用）。
 *
 * 从 TabBar 抽出来，是为了两处**视觉完全统一**：用户明确要求广场底部
 * 跟第一个页面一致。抽成一个组件而不是复制一份，避免以后调玻璃效果要改两处。
 *
 * 结构 = 位移贴图滤镜 + 玻璃罩 + 一排药丸：
 * - 药丸三层分离（见 globals.css 的 .liquid-pill 注释），任一层失效都不会
 *   退化成透明条（a7863fa 变灰事故防护）
 * - 玻璃罩盖在激活项的玻璃之上、图标之下，跨项时整块平移（ease-apple-pop 过冲）
 * - 按住激活项：罩放大 1.1 + 增强色散淡入（彩虹发散）
 */
export default function LiquidTabBar({
  items,
  activeKey,
  ariaLabel,
  reducedMotion = false,
  action,
}: LiquidTabBarProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLElement | null)[]>([]);

  // 位移贴图必须与药丸实际尺寸一致（feImage 会拉伸，尺寸错了折射就跑到元素外）。
  // 各药丸 flex-1 等宽等高，量第一个即可；阈值 0.5px 防止抖动引发渲染循环。
  const [pill, setPill] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = tabRefs.current[0];
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setPill((prev) =>
        Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5
          ? prev
          : { w: r.width, h: r.height },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length]);

  /** 玻璃罩位置：激活项相对于导航行的矩形，四周各外扩 DOME_INSET */
  const [dome, setDome] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const activeIndex = items.findIndex((t) => t.key === activeKey);

  const measureDome = useCallback(() => {
    const row = rowRef.current;
    const tab = activeIndex >= 0 ? tabRefs.current[activeIndex] : null;
    if (!row || !tab) {
      // 没有激活项（搜索面板打开等）：把罩收起来，别停在上一处误导人
      setDome({ x: 0, y: 0, w: 0, h: 0 });
      return;
    }
    const rr = row.getBoundingClientRect();
    const tr = tab.getBoundingClientRect();
    const next: Rect = {
      x: tr.left - rr.left - DOME_INSET,
      y: tr.top - rr.top - DOME_INSET,
      w: tr.width + DOME_INSET * 2,
      h: tr.height + DOME_INSET * 2,
    };
    setDome((prev) =>
      Math.abs(prev.x - next.x) < 0.5 &&
      Math.abs(prev.y - next.y) < 0.5 &&
      Math.abs(prev.w - next.w) < 0.5 &&
      Math.abs(prev.h - next.h) < 0.5
        ? prev
        : next,
    );
  }, [activeIndex]);

  useEffect(() => {
    measureDome();
    const row = rowRef.current;
    if (!row) return;
    const ro = new ResizeObserver(measureDome);
    ro.observe(row);
    window.addEventListener('resize', measureDome);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measureDome);
    };
  }, [measureDome]);

  /** 按住激活项：罩放大 + 彩虹发散淡入 */
  const [pressed, setPressed] = useState(false);
  const releasePress = useCallback(() => setPressed(false), []);

  const domeReady = dome.w > 0 && dome.h > 0;

  return (
    <nav
      aria-label={ariaLabel}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-overlay"
    >
      {/* 液态玻璃位移贴图：尺寸来自实测，未量到前不渲染
          （SSR 首帧无滤镜，此时 CSS 已回退到磨砂基线，不会闪出透明条） */}
      {pill.w > 0 && (
        <LiquidGlassFilter
          id={PILL_FILTER_ID}
          width={pill.w}
          height={pill.h}
          radius={pill.h / 2}
        />
      )}
      {domeReady && (
        <>
          <LiquidGlassFilter
            id={DOME_FILTER_ID}
            width={dome.w}
            height={dome.h}
            radius={dome.h / 2}
          />
          <LiquidGlassFilter
            id={DOME_BOOST_FILTER_ID}
            width={dome.w}
            height={dome.h}
            radius={dome.h / 2}
            strength={DOME_BOOST_STRENGTH}
          />
        </>
      )}

      <div className="pb-safe">
        <div
          ref={rowRef}
          className="relative isolate mx-auto flex max-w-bar items-stretch gap-1 px-page pb-2 pt-1.5"
        >
          {/* 玻璃罩：DOM 上排在药丸之前、z-index 1，盖在药丸玻璃之上、
              图标文字之下（药丸刻意不建独立层叠上下文，见 globals.css）。
              外层管跨项平移，内层管按压缩放，两个 transform 互不打断 */}
          {domeReady && (
            <span
              aria-hidden
              className={cn(
                'liquid-dome',
                reducedMotion
                  ? ''
                  : 'transition-[transform,width,height] duration-spring ease-apple-pop',
              )}
              style={{
                width: dome.w,
                height: dome.h,
                transform: `translate3d(${dome.x}px, ${dome.y}px, 0)`,
              }}
            >
              <span
                className="liquid-dome__inner"
                style={{
                  transform: pressed && !reducedMotion ? 'scale(1.1)' : 'scale(1)',
                }}
              >
                <span className="liquid-dome__frost" />
                <span className="liquid-dome__refract" />
                <span
                  className="liquid-dome__refract liquid-dome__boost"
                  style={{ opacity: pressed && !reducedMotion ? 1 : 0 }}
                />
                <span
                  className="liquid-dome__rainbow"
                  style={{ opacity: pressed && !reducedMotion ? 1 : 0 }}
                />
              </span>
            </span>
          )}

          {items.map(({ key, label, icon: Icon, href, onClick, badge, overlay }, i) => {
            const active = key === activeKey;
            const cls = cn(
              'liquid-pill pointer-events-auto flex flex-1 flex-col items-center gap-[3px] rounded-full px-0.5 pb-1.5 pt-2',
              'text-micro font-medium tracking-wide',
              // 按下反馈只作用于非激活项：激活项的按压反馈由玻璃罩承担，
              // 所以这里二选一 —— 非激活项吃 .pressable（丝滑按压），
              // 激活项只保留颜色过渡，不给缩放。
              active
                ? 'transition-colors duration-base ease-apple'
                : 'pressable',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-apple-blue/40',
              active ? 'text-apple-blue' : 'text-apple-text-3 hover:text-apple-text-2',
            );
            const inner = (
              <>
                {/* 玻璃两层：实底白永远兜底；折射层 Chromium 下升级为
                    backdrop-filter: url()。两者都在内容之下，
                    所以 icon/label 必须 position:relative 才不被盖住 */}
                <span className="liquid-pill__frost" aria-hidden />
                <span className="liquid-pill__refract" aria-hidden />

                {/* z-[2]：压在玻璃罩（z-index 1）之上，图标文字永远清晰 */}
                <span className="relative z-[2]">
                  <Icon
                    className="h-[22px] w-[22px]"
                    strokeWidth={active ? 2.2 : 1.7}
                    aria-hidden
                  />
                  {active && overlay}
                  {badge}
                </span>
                <span className="relative z-[2]">{label}</span>
              </>
            );

            const pressProps = {
              onPointerDown: () => {
                if (active) setPressed(true);
              },
              onPointerUp: releasePress,
              onPointerCancel: releasePress,
              onPointerLeave: releasePress,
            };

            return href ? (
              <Link
                key={key}
                href={href}
                ref={(el: HTMLAnchorElement | null) => {
                  tabRefs.current[i] = el;
                }}
                aria-current={active ? 'page' : undefined}
                className={cls}
                {...pressProps}
              >
                {inner}
              </Link>
            ) : (
              <button
                key={key}
                type="button"
                ref={(el: HTMLButtonElement | null) => {
                  tabRefs.current[i] = el;
                }}
                onClick={onClick}
                aria-current={active ? 'page' : undefined}
                className={cls}
                {...pressProps}
              >
                {inner}
              </button>
            );
          })}

          {/* 行尾圆形动作钮：用户要求搜索跟其余 Tab 形态不同（圆胶囊 + 放大镜）。
              同样走液态玻璃药丸的三层，只是形状是正圆、内容只有图标 */}
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              aria-label={action.label}
              aria-expanded={action.active}
              className={cn(
                'liquid-pill pointer-events-auto my-1.5 flex h-11 w-11 flex-none items-center justify-center self-center rounded-full',
                'pressable-soft',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40',
                action.active ? 'text-apple-blue' : 'text-apple-text-2',
              )}
            >
              <span className="liquid-pill__frost" aria-hidden />
              <span className="liquid-pill__refract" aria-hidden />
              <action.icon
                className="relative z-[2] h-[19px] w-[19px]"
                strokeWidth={2.1}
                aria-hidden
              />
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

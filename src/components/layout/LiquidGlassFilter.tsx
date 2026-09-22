'use client';

import { useMemo } from 'react';
import { buildDisplacementMap, dispersionScales } from '@/lib/liquid-glass';

interface LiquidGlassFilterProps {
  /** 供 CSS `backdrop-filter: url(#id)` 引用 */
  id: string;
  /** 目标元素实测尺寸（px）—— 必须与元素盒一致，见 liquid-glass.ts 注释 */
  width: number;
  height: number;
  /** 圆角（px），药丸形传 height / 2 */
  radius: number;
  /** 位移强度系数，按短边等比；默认同 demo（-180 / 96px） */
  strength?: number;
}

/**
 * 液态玻璃的 SVG 滤镜定义（隐藏，零尺寸）。
 *
 * 管线（逐条对应 demo）：
 *   位移贴图 → 三通道各自 feDisplacementMap（R/G/B 位移量不同 = 色散）
 *   → feColorMatrix 各摘一个通道 → feBlend screen 叠回 → 轻模糊收边。
 *
 * 注意：`backdrop-filter: url(#…)` **仅 Chromium 支持**。本组件只是定义滤镜，
 * 是否启用由 CSS 的 @supports 决定；不支持的浏览器走保底磨砂，见 globals.css 的 .liquid-pill。
 */
export default function LiquidGlassFilter({
  id,
  width,
  height,
  radius,
  strength,
}: LiquidGlassFilterProps) {
  const map = useMemo(
    () => buildDisplacementMap({ width, height, radius }),
    [width, height, radius],
  );
  const scales = useMemo(
    () => dispersionScales(Math.min(width, height), strength),
    [width, height, strength],
  );

  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        <filter
          id={id}
          colorInterpolationFilters="sRGB"
          x="0"
          y="0"
          width="100%"
          height="100%"
        >
          {/* 输入：位移贴图（feImage 会把图拉伸到滤镜区域，所以尺寸必须实测） */}
          <feImage x="0" y="0" width="100%" height="100%" result="map" href={map} />

          {/* 红通道：位移量最大 */}
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            xChannelSelector="R"
            yChannelSelector="B"
            scale={scales.red}
            result="dispRed"
          />
          <feColorMatrix
            in="dispRed"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="red"
          />

          {/* 绿通道：基准 */}
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            xChannelSelector="R"
            yChannelSelector="B"
            scale={scales.green}
            result="dispGreen"
          />
          <feColorMatrix
            in="dispGreen"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="green"
          />

          {/* 蓝通道：位移量中等 */}
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            xChannelSelector="R"
            yChannelSelector="B"
            scale={scales.blue}
            result="dispBlue"
          />
          <feColorMatrix
            in="dispBlue"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="blue"
          />

          <feBlend in="red" in2="green" mode="screen" result="rg" />
          <feBlend in="rg" in2="blue" mode="screen" result="output" />
          <feGaussianBlur in="output" stdDeviation="0.7" />
        </filter>
      </defs>
    </svg>
  );
}

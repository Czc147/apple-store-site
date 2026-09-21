import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface GlassSurfaceProps {
  /**
   * 色斑调色板：
   * - prism（默认）= UI 升级的彩色底斑（indigo/cyan/purple 为主，§2.1 Premium 色斑）
   * - premium = 旧的 indigo→violet 身份色斑（保留兼容）
   * - neutral = 蓝灰冷色斑（不希望出现明显彩色时用）
   */
  tint?: 'prism' | 'premium' | 'neutral';
  /** hero=28px（默认）· premium=32px（订阅大卡/高级玻璃卡） */
  radius?: 'hero' | 'premium';
  /** 外层容器附加类（间距/几何） */
  className?: string;
  children?: ReactNode;
}

const RADIUS = {
  hero: 'rounded-hero',
  premium: 'rounded-premium',
} as const;

/**
 * Premium Glass（UI 升级 §3.3）：本次升级的高级材质，**不是全站默认材质**。
 * 三层结构：色斑层（2–3 个柔和椭圆，24%–48% 透明度，blur 40–80px）→
 * 玻璃层（半透明白 .42 起 + blur24 saturate1.7 + 白高亮描边 + 双层扩散投影）
 * → 内容层（深色文字，色斑不得直接承载文字、不得覆盖主操作按钮）。
 *
 * 适用范围（§3.3）：订阅主推卡 / 高级会员卡 / 年度团队推荐方案卡 / 活动主视觉 /
 * 每日推荐信息层 / 兑换成功或优惠券强展示。
 * 禁止（§3.3 不适用组件）：普通商品卡 / 列表行 / 表单 / 社区普通帖 /
 * 愿望单普通行 / 后台管理界面 / 长文本说明区。
 *
 * 防护（a7863fa 线上变灰事故教训）：面板白底不低于 0.42；
 * @supports 无 backdrop-filter 时回退近实底白（globals.css .glass-premium）。
 */
export default function GlassSurface({
  tint = 'prism',
  radius = 'hero',
  className,
  children,
}: GlassSurfaceProps) {
  return (
    <div className={cn('relative isolate overflow-hidden', RADIUS[radius], className)}>
      {/* 色斑层：玻璃后面的"风景"（静态，无动效；色斑不承载文字） */}
      <div aria-hidden className="absolute inset-0 -z-10">
        {tint === 'prism' && (
          <div className="absolute inset-0 bg-gradient-to-b from-apple-card to-apple-premium-soft">
            <div className="absolute -left-16 -top-20 h-64 w-64 rounded-full bg-prism-indigo/45 blur-[72px]" />
            <div className="absolute -bottom-24 -right-14 h-72 w-72 rounded-full bg-prism-purple/40 blur-[80px]" />
            <div className="absolute -bottom-16 left-1/4 h-52 w-52 rounded-full bg-prism-cyan/35 blur-[64px]" />
            <div className="absolute -right-6 top-1/4 h-40 w-40 rounded-full bg-prism-blue/30 blur-[56px]" />
          </div>
        )}
        {tint === 'premium' && (
          <div className="absolute inset-0 bg-apple-premium-soft">
            <div className="absolute -left-12 -top-16 h-56 w-56 rounded-full bg-apple-premium/30 blur-3xl" />
            <div className="absolute -bottom-20 -right-12 h-64 w-64 rounded-full bg-apple-premium-2/30 blur-3xl" />
            <div className="absolute left-1/3 top-1/4 h-40 w-40 rounded-full bg-apple-blue/10 blur-3xl" />
          </div>
        )}
        {tint === 'neutral' && (
          <div className="absolute inset-0 bg-apple-surface">
            <div className="absolute -left-12 -top-16 h-56 w-56 rounded-full bg-apple-blue-soft blur-3xl" />
            <div className="absolute -bottom-20 -right-12 h-64 w-64 rounded-full bg-apple-border/30 blur-3xl" />
          </div>
        )}
      </div>
      {/* 玻璃层（内容层由 children 承载） */}
      <div className={cn('glass-premium shadow-premium relative', RADIUS[radius])}>{children}</div>
    </div>
  );
}

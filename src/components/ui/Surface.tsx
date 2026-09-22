import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type SurfaceRadius = 'card' | 'card-lg' | 'hero' | 'premium';

interface SurfaceProps {
  as?: 'div' | 'section' | 'article' | 'li' | 'button';
  radius?: SurfaceRadius;
  /** 整卡可点时加：hover 上浮 + 阴影加深 + 按压缩放（Brief 的 Card interaction） */
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
  onClick?: () => void;
  'aria-label'?: string;
}

const RADIUS: Record<SurfaceRadius, string> = {
  card: 'rounded-card',
  'card-lg': 'rounded-card-lg',
  hero: 'rounded-hero',
  premium: 'rounded-premium',
};

/**
 * 标准内容卡壳（Brief 材质层级的 Content/Elevated Surface）：
 * 纯白底 + 浅描边 + card 阴影 + 20/24/28 三档圆角。
 * audit 收敛：卡片壳曾 15+ 处手写、20 vs 24px 混用无规则——
 * 规约：默认 card(20)；页面级大区块/弹层容器用 card-lg / hero。
 * premium 玻璃材质请用 GlassSurface，导航层用 .glass，勿混。
 */
export default function Surface({
  as,
  radius = 'card',
  interactive,
  className,
  children,
  onClick,
  'aria-label': ariaLabel,
}: SurfaceProps) {
  const cls = cn(
    'border border-apple-border bg-apple-card shadow-card',
    RADIUS[radius],
    interactive &&
      'pressable hover:-translate-y-0.5 hover:shadow-card-hover',
    className,
  );

  if (as === 'button') {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel} className={cls}>
        {children}
      </button>
    );
  }

  const Tag = as ?? 'div';
  return <Tag className={cls}>{children}</Tag>;
}

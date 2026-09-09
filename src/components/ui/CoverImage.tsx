'use client';

import Image from 'next/image';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type CoverRatio = 'video' | 'wide' | 'photo' | 'square';

const RATIOS: Record<CoverRatio, string> = {
  video: 'aspect-video',
  wide: 'aspect-[21/9]',
  photo: 'aspect-[4/3]',
  square: 'aspect-square',
};

interface CoverImageProps {
  src?: string | null;
  alt: string;
  ratio?: CoverRatio;
  /** 无图/加载失败的底色（DB cover_color / accent_color），缺省用品牌浅蓝渐变 */
  fallbackStyle?: CSSProperties;
  sizes?: string;
  priority?: boolean;
  /** 叠层槽（渐变遮罩/角标/标题层），由调用方决定 pointer-events */
  overlay?: ReactNode;
  className?: string;
}

/**
 * 统一封面图（Hero 的直接底座）。
 * audit 收敛：图片处理曾双轨——CardImage 有骨架+失败回退，
 * DailyPickBlock/弹层是裸 <img> 无任何状态。
 * 行为：shimmer 骨架 → next/image 淡入（slow/ease-apple）→
 * 失败或无图回退渐变底色；比例四档收敛（16/9、21/9、4/3、1/1）。
 */
export default function CoverImage({
  src,
  alt,
  ratio = 'video',
  fallbackStyle,
  sizes = '100vw',
  priority,
  overlay,
  className,
}: CoverImageProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const showImage = Boolean(src) && state !== 'failed';

  return (
    <div className={cn('relative w-full overflow-hidden bg-apple-bg', RATIOS[ratio], className)}>
      {showImage ? (
        <>
          <div
            className={cn(
              'skeleton absolute inset-0 transition-opacity duration-slow ease-apple',
              state === 'ready' && 'opacity-0',
            )}
            aria-hidden
          />
          <Image
            src={src as string}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            onLoad={() => setState('ready')}
            onError={() => setState('failed')}
            className={cn(
              'object-cover transition-opacity duration-slow ease-apple',
              state === 'ready' ? 'opacity-100' : 'opacity-0',
            )}
          />
        </>
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-apple-blue-soft via-white to-apple-surface"
          style={fallbackStyle}
        />
      )}
      {overlay}
    </div>
  );
}

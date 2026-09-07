'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ImageOff } from 'lucide-react';

interface CardImageProps {
  src: string | null;
  alt: string;
  /** 两列网格紧凑卡片用 1:1 方图（默认 16:9） */
  square?: boolean;
  /** 无图占位的底色/渐变（后台「封面底色」），覆盖默认浅渐变 */
  fallbackColor?: string | null;
}

/**
 * 卡片展示图：object-cover。
 * - 加载中显示 shimmer 占位
 * - 无图 / 加载失败时显示占位（优先 fallbackColor，否则浅渐变）
 */
export default function CardImage({
  src,
  alt,
  square = false,
  fallbackColor = null,
}: CardImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={`relative w-full overflow-hidden bg-apple-bg ${
        square ? 'aspect-square' : 'aspect-video'
      }`}
    >
      {showImage ? (
        <>
          {!loaded && <div className="skeleton absolute inset-0" aria-hidden />}
          <Image
            src={src!}
            alt={alt}
            fill
            sizes="(min-width: 768px) 33vw, 50vw"
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`object-cover transition-opacity duration-300 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </>
      ) : (
        <div
          className="flex h-full w-full items-center justify-center"
          style={
            fallbackColor
              ? { background: fallbackColor }
              : { background: 'linear-gradient(to bottom right, #E9F1FB, #DBE4F3)' }
          }
          aria-hidden
        >
          <ImageOff className="h-9 w-9 text-apple-text-3/50" strokeWidth={1.4} />
        </div>
      )}
    </div>
  );
}

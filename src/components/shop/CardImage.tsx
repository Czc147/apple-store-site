'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface CardImageProps {
  src: string | null;
  alt: string;
}

/**
 * 卡片展示图：16:9 · object-cover。
 * - 加载中显示 shimmer 占位
 * - 无图 / 加载失败时显示浅渐变占位（不让卡片破版）
 */
export default function CardImage({ src, alt }: CardImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-apple-bg">
      {showImage ? (
        <>
          {!loaded && <div className="skeleton absolute inset-0" aria-hidden />}
          <img
            src={src!}
            alt={alt}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`h-full w-full object-cover transition-opacity duration-300 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </>
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#E9F1FB] to-[#DBE4F3]"
          aria-hidden
        >
          <ImageOff className="h-9 w-9 text-apple-text-3/50" strokeWidth={1.4} />
        </div>
      )}
    </div>
  );
}

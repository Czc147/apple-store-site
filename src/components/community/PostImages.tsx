'use client';

import CoverImage from '@/components/ui/CoverImage';
import { cn } from '@/lib/cn';

/**
 * 帖子配图区（迁移 024）。帖子卡、官方公告卡、收藏流气泡共用。
 *
 * 排布按张数分档，不是一律九宫格：单图铺大图（4:3），2 张与 4 张走两列，
 * 其余（3、5–9）走三列。一律三列的话单图被挤成一个小方块、正文旁边孤零零的，
 * 而发帖最常见的恰恰是单图。
 *
 * 点击交给调用方（`onOpen`）—— 由帖子卡决定开全屏查看器还是别的行为，
 * 这个组件本身不持有查看器状态。
 */
export default function PostImages({
  images,
  onOpen,
  className,
}: {
  images: string[];
  /** 点击第 index 张；不传则图片不可点（如后台预览） */
  onOpen?: (index: number) => void;
  className?: string;
}) {
  if (!images || images.length === 0) return null;

  const single = images.length === 1;

  return (
    <div className={cn('mt-3', className)}>
      {single ? (
        <ImageButton
          url={images[0]}
          index={0}
          alt="配图"
          ratio="photo"
          sizes="(min-width: 1024px) 640px, 92vw"
          onOpen={onOpen}
        />
      ) : (
        <ul
          className={cn(
            'grid gap-2',
            images.length === 2 || images.length === 4 ? 'grid-cols-2' : 'grid-cols-3',
          )}
        >
          {images.map((url, i) => (
            <li key={url}>
              <ImageButton
                url={url}
                index={i}
                alt={`配图 ${i + 1}`}
                ratio="square"
                sizes={images.length === 2 || images.length === 4 ? '46vw' : '30vw'}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImageButton({
  url,
  index,
  alt,
  ratio,
  sizes,
  onOpen,
}: {
  url: string;
  index: number;
  alt: string;
  ratio: 'photo' | 'square';
  sizes: string;
  onOpen?: (index: number) => void;
}) {
  const media = (
    <CoverImage
      src={url}
      alt={alt}
      ratio={ratio}
      sizes={sizes}
      className="rounded-card"
    />
  );

  if (!onOpen) return media;

  return (
    <button
      type="button"
      onClick={(e) => {
        // 阻止冒泡：图片外面那层挂了"单击进详情"，不拦的话点图会同时开
        // 查看器和详情层（两层浮层叠在一起）
        e.stopPropagation();
        onOpen(index);
      }}
      aria-label={`查看${alt}`}
      className="block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
    >
      {media}
    </button>
  );
}

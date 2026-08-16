'use client';

import { Heart, Plus } from 'lucide-react';
import { useWishlist } from '@/lib/wishlist';
import { formatPrice } from '@/lib/format';
import type { SubUnit } from '@/lib/types';

/**
 * 小单元行：名称 + 价格（¥xx.xx）+ 右侧「添加至愿望单」按钮。
 * 已收藏 → 实心爱心（品牌蓝浅底确认态），再点一次移除。
 */
export default function SubUnitRow({ sub }: { sub: SubUnit }) {
  const { has, toggle } = useWishlist();
  const added = has(sub.id);

  return (
    <li className="flex items-center gap-3 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium leading-snug text-apple-text">
          {sub.name}
        </div>
        <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-apple-text">
          {formatPrice(sub.price)}
        </div>
      </div>

      <button
        type="button"
        onClick={() =>
          toggle({
            id: sub.id,
            name: sub.name,
            price: sub.price,
            payment_url: sub.payment_url,
          })
        }
        aria-pressed={added}
        aria-label={added ? `将「${sub.name}」移出愿望单` : `将「${sub.name}」加入愿望单`}
        title={added ? '移出愿望单' : '加入愿望单'}
        className={[
          'flex h-9 w-9 flex-none items-center justify-center rounded-full border',
          'transition-all duration-200 ease-apple active:scale-90',
          added
            ? 'border-transparent bg-apple-blue-soft text-apple-blue'
            : 'border-apple-border bg-white text-apple-text hover:border-apple-text-3',
        ].join(' ')}
      >
        {added ? (
          <Heart className="h-[18px] w-[18px]" fill="currentColor" strokeWidth={1.5} aria-hidden />
        ) : (
          <Plus className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        )}
      </button>
    </li>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Ticket } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import CopyButton from '@/components/admin/CopyButton';
import Surface from '@/components/ui/Surface';
import CouponRowCard, { claimStateBadge } from '@/components/coupons/CouponRowCard';
import MemberCard from '@/components/member/MemberCard';
import type { MemberCardInfo } from '@/lib/vip-benefits';
import {
  countAvailable,
  countExpiringSoon,
  sortMyCoupons,
  toCouponRow,
  type MyCouponItem,
} from '@/components/coupons/coupon-row-adapter';
import { cn } from '@/lib/cn';

interface MyCouponsCardProps {
  /**
   * 会员卡（迁移 023）。由 LibraryClient 从 /api/library 的响应里带下来，
   * **不在这里再发一次请求** —— 同一份数据没必要拉两遍。
   */
  memberCard?: MemberCardInfo | null;
}

/**
 * 「我的券」（我的库 · 横放卡片）：
 * - 收起态是一行横向卡：券图标 + 「我的券」+「N 张可用」+ 箭头
 * - 点击展开：丝滑高度+淡入过渡（duration-base + ease-apple，站内规约：
 *   唯一允许过冲的动效是角标 badge-pop，展开不做弹跳）
 * - 展开后列出券名（后台建券时填的名称）+ 面额 + 门槛 + 有效期 + 状态 + 专属码复制
 * - **会员卡排在所有券之后**（用户 2026-09-22 拍板：券在前，卡在后）
 * - 券和卡都没有时才不渲染（不占版面）
 */
export default function MyCouponsCard({ memberCard = null }: MyCouponsCardProps) {
  const { user, loading, getAuthHeaders } = useAuth();
  const [items, setItems] = useState<MyCouponItem[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) return;
      const res = await fetch('/api/coupons/mine', { headers });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: MyCouponItem[] };
      setItems(sortMyCoupons(Array.isArray(data.items) ? data.items : []));
    } catch {
      /* 静默：券加载失败不影响我的库其余部分 */
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setItems(null);
      return;
    }
    void load();
  }, [loading, user?.id, load]);

  // 券还没加载出来时先不渲染；但**有卡无券也要显示**，所以不能按 items 为空直接返回
  if (!user || !items) return null;
  if (items.length === 0 && !memberCard) return null;

  const available = countAvailable(items);
  const expiringSoon = countExpiringSoon(items);
  const expiredCount = items.filter((i) => i.status === 'expired').length;

  return (
    <Surface radius="card-lg" className="mb-5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? '收起我的券' : '展开我的券'}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors duration-fast ease-apple hover:bg-apple-bg/60 active:bg-apple-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-apple-blue/40"
      >
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-apple-danger-soft">
          <Ticket className="h-5 w-5 text-apple-danger" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-md font-bold text-apple-text">我的券</span>
          <span className="mt-0.5 block text-xs text-apple-text-2">
            {items.length > 0 ? (
              <>
                {available > 0 ? `${available} 张可用` : '暂无可用'}
                {items.length > available && ` · 共 ${items.length} 张`}
                {expiredCount > 0 && available === 0 && '（已过期）'}
              </>
            ) : (
              // 有卡无券：说清楚这里是有东西的，否则「暂无可用」会让人以为整块是空的
              '会员卡'
            )}
            {/* 被动到期提醒（§无定时任务的降级）：收起态即可见 */}
            {expiringSoon > 0 && (
              <span className="font-medium text-apple-danger">
                {' · '}
                {expiringSoon} 张即将过期
              </span>
            )}
            {memberCard && (
              <span className="text-apple-text-3">
                {items.length > 0 && ' · '}
                1 张会员卡
              </span>
            )}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 flex-none text-apple-text-3 transition-transform duration-base ease-apple',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {/* 展开区：grid-template-rows 0fr→1fr 过渡（无需测量高度，也不会闪） */}
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-base ease-apple',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-2.5 border-t border-apple-hairline p-4">
            {items.map((item) => (
              <CouponRowCard
                key={item.claim.id}
                coupon={toCouponRow(item)}
                action={
                  item.status === 'available' ? (
                    <span className="flex items-center gap-1">
                      <code className="font-mono text-xs text-apple-text-2">{item.claim.code}</code>
                      <CopyButton text={item.claim.code} />
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-apple-text-3">{item.claim.code}</span>
                  )
                }
                className={
                  claimStateBadge(item.claim, item.status === 'expired')?.text === '已使用' ||
                  item.status === 'expired'
                    ? 'opacity-70'
                    : undefined
                }
              />
            ))}
            {/* 会员卡排在所有券之后（用户拍板：券在前，卡在后） */}
            {memberCard && (
              <MemberCard
                variant={memberCard.style}
                text={memberCard.text}
                expiresAt={memberCard.expiresAt}
              />
            )}
            <p className="text-2xs leading-relaxed text-apple-text-3">
              一人一码：结账时在「优惠码」里填入可用券的专属码即可抵扣；券不可转赠。
            </p>
          </div>
        </div>
      </div>
    </Surface>
  );
}

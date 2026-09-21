'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ticket } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import CopyButton from '@/components/admin/CopyButton';
import SectionHeader from '@/components/ui/SectionHeader';
import CouponRowCard, { claimStateBadge } from './CouponRowCard';
import { toCouponRow, type MyCouponItem } from './coupon-row-adapter';

/**
 * 「我的优惠券」（活动页底部，登录后显示）：
 * 列出本账号领取过的全部券（含已使用 / 已过期），随时回看专属码。
 * 未领取任何券时不渲染（不占版面）。
 */
export default function MyCoupons({ refreshKey = 0 }: { refreshKey?: number }) {
  const { user, loading, getAuthHeaders } = useAuth();
  const [items, setItems] = useState<MyCouponItem[] | null>(null);

  const load = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) return;
      const res = await fetch('/api/coupons/mine', { headers });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: MyCouponItem[] };
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      /* 静默：我的券区加载失败不阻断活动页 */
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setItems(null);
      return;
    }
    void load();
  }, [loading, user?.id, load, refreshKey]);

  if (!user || !items || items.length === 0) return null;

  const available = items.filter((i) => i.status === 'available').length;

  return (
    <section className="mt-8">
      <SectionHeader title="我的优惠券" count={items.length} />
      {available > 0 && (
        <p className="mb-2.5 text-xs text-apple-text-2">
          有 {available} 张可用 · 结账时在「优惠码」里填入即可抵扣
        </p>
      )}
      <div className="space-y-2.5">
        {items.map((item) => {
          const row = toCouponRow(item);
          const badge = claimStateBadge(item.claim, item.status === 'expired');
          return (
            <CouponRowCard
              key={item.claim.id}
              coupon={row}
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
              className={badge?.text === '已使用' || item.status === 'expired' ? 'opacity-70' : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}

'use client';

import { useState } from 'react';
import { Ticket } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import type { CouponWithState } from '@/lib/coupon-types';
import Button from '@/components/ui/Button';
import Message from '@/components/ui/Message';
import CopyButton from '@/components/admin/CopyButton';
import CouponRowCard from './CouponRowCard';

/**
 * 活动弹层里的券列表 + 领取入口：
 * - 未登录：按钮引导登录（登录后回到活动页再领）
 * - 已领取：直接展示专属码 + 复制（结账时粘贴）
 * - 未领取且可领：点「领取」调 POST /api/coupons/claim（服务端原子校验）
 * 领取成功后本地更新该券的 my_claim，无需整页刷新。
 */
export default function CouponClaimList({
  coupons,
  onChange,
}: {
  coupons: CouponWithState[];
  /** 领取成功后回调（父组件更新自己的券列表状态） */
  onChange: (couponId: string, myClaim: CouponWithState['my_claim']) => void;
}) {
  const { user, getAuthHeaders } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (coupons.length === 0) return null;

  const handleClaim = async (coupon: CouponWithState) => {
    if (busyId) return;
    setBusyId(coupon.id);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/coupons/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ coupon_id: coupon.id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        claim?: { id: string; code: string; claimed_at: string };
      };
      if (!res.ok || !data.claim) {
        setError(data.error ?? '领取失败，请稍后再试');
        return;
      }
      onChange(coupon.id, {
        id: data.claim.id,
        code: data.claim.code,
        claimed_at: data.claim.claimed_at,
        used_at: null,
        order_id: null,
      });
    } catch {
      setError('网络异常，请稍后再试');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="border-t border-apple-hairline px-5 pb-4 pt-4">
      <p className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-apple-text">
        <Ticket className="h-4 w-4 text-apple-danger" aria-hidden />
        优惠券
      </p>

      <div className="space-y-2.5">
        {coupons.map((coupon) => {
          // 还能不能再领：本人已领数 < 每人限领（后台可设为 >1）
          const canClaimMore = coupon.my_claim_count < coupon.per_user_limit;
          const soldOut = coupon.remaining !== null && coupon.remaining <= 0;
          return (
            <CouponRowCard
              key={coupon.id}
              coupon={coupon}
              action={
                !user ? (
                  <Button variant="secondary" size="sm" href="/login?from=/activities">
                    登录后领取
                  </Button>
                ) : canClaimMore && !soldOut ? (
                  <span className="flex flex-col items-end gap-1">
                    <Button
                      variant="primary"
                      size="sm"
                      loading={busyId === coupon.id}
                      onClick={() => void handleClaim(coupon)}
                    >
                      {coupon.my_claim_count > 0 ? '再领一张' : '领取'}
                    </Button>
                    {coupon.my_claim && (
                      <span className="flex items-center gap-1">
                        <code className="font-mono text-2xs text-apple-text-3">
                          {coupon.my_claim.code}
                        </code>
                        <CopyButton text={coupon.my_claim.code} />
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="flex flex-col items-end gap-1">
                    {coupon.my_claim && (
                      <span className="flex items-center gap-1">
                        <code className="font-mono text-xs text-apple-text-2">
                          {coupon.my_claim.code}
                        </code>
                        <CopyButton text={coupon.my_claim.code} />
                      </span>
                    )}
                    <span className="text-2xs text-apple-text-3">
                      {soldOut ? '已领完' : `每人限领 ${coupon.per_user_limit} 张`}
                    </span>
                  </span>
                )
              }
            />
          );
        })}
      </div>

      {error && (
        <Message tone="error" className="mt-2.5">
          {error}
        </Message>
      )}
      <p className="mt-2.5 text-2xs leading-relaxed text-apple-text-3">
        一人一码：领取后专属码只属于当前账号，结账时填入即可抵扣；票券不可转赠。
      </p>
    </div>
  );
}

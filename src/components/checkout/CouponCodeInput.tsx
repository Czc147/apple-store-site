'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Ticket, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { formatPrice } from '@/lib/format';
import type { OrderCreateItem } from '@/lib/order-types';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import { inputCls } from '@/components/admin/ui';
import { couponThresholdText } from '@/lib/coupon-types';
import { couponFaceText } from '@/components/coupons/CouponRowCard';
import type { MyCouponItem } from '@/components/coupons/coupon-row-adapter';
import { cn } from '@/lib/cn';

/** 应用成功的券（父组件据此调 /api/orders 的 coupon_code 与展示实付） */
export interface AppliedCoupon {
  code: string;
  name: string;
  /** **本单实际生效**的优惠金额（VIP 更划算时这里是 VIP 的额度） */
  discount_amount: number;
  payable: number;
  original_total: number;
  /**
   * 本单优惠实际来自券还是 VIP 折扣（迁移 023：两者不叠加，取更优）。
   * 缺省视为 'coupon'，兼容不返回该字段的旧路径。
   */
  effective_source?: 'coupon' | 'vip' | null;
  /** 这张券自己的折扣额，用于 VIP 胜出时说明「券没被用掉」 */
  coupon_discount_amount?: number;
  vip?: { percent: number; discount_amount: number; better: boolean } | null;
}

/**
 * 优惠码输入框 + 「可直接选券」快捷区（愿望单结算 / 订阅结算共用）：
 * - 手输/粘贴 → POST /api/coupons/validate（服务端按目标现价重算原价 + 校验券）→
 *   通过后把结果交给父组件（父组件用它显示优惠/实付，并在下单时带上 coupon_code）
 * - 快捷区列出本人「可使用」的券，点一下等同填入该码并试算；
 *   未达门槛的券置灰并标注门槛（orderTotal 由父组件传入，用于这个提示）
 * 真正的权威校验在下单时再做一遍，这里只是预览。
 */
export default function CouponCodeInput({
  items,
  applied,
  onChange,
  orderTotal,
}: {
  /** 当前结算的商品行（与下单请求体一致） */
  items: OrderCreateItem[];
  applied: AppliedCoupon | null;
  onChange: (next: AppliedCoupon | null) => void;
  /** 当前订单原价（仅用于给未达门槛的券加提示；金额以服务端为准） */
  orderTotal?: number;
}) {
  const { user, getAuthHeaders } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MyCouponItem[] | null>(null);

  // 拉「我领的券」（登录后；已应用时不再需要）
  const loadMine = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) return;
      const res = await fetch('/api/coupons/mine', { headers });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: MyCouponItem[] };
      setMine(Array.isArray(data.items) ? data.items : []);
    } catch {
      /* 静默：快捷区加载失败不影响手动输码 */
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (!user || applied) return;
    void loadMine();
  }, [user, applied, loadMine]);

  /** 用某个码试算（手动输入与点选券共用） */
  const applyCode = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || busy) return;
    if (!user) {
      setError('请先登录后再使用优惠码');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ code: trimmed, items }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | (AppliedCoupon & { error?: string })
        | { error?: string };
      if (!res.ok) {
        setError((data as { error?: string }).error ?? '优惠码不可用');
        onChange(null);
        return;
      }
      const ok = data as AppliedCoupon;
      onChange({
        code: ok.code,
        name: ok.name,
        discount_amount: ok.discount_amount,
        payable: ok.payable,
        original_total: ok.original_total,
        effective_source: ok.effective_source ?? 'coupon',
        coupon_discount_amount: ok.coupon_discount_amount,
        vip: ok.vip ?? null,
      });
      setCode('');
    } catch {
      setError('网络异常，请稍后再试');
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    onChange(null);
    setError(null);
  };

  const available = (mine ?? []).filter((c) => c.status === 'available');

  if (applied) {
    // VIP 更划算时如实说明：这单走的是会员价，填的券**没有**被核销，下次还能用。
    // 不解释的话用户会以为"填了码怎么没减那么多"，甚至以为券被吞了。
    const vipWins = applied.effective_source === 'vip';

    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-card border px-3.5 py-2.5',
          vipWins
            ? 'border-apple-blue/25 bg-apple-blue-soft'
            : 'border-apple-success/25 bg-apple-success-soft',
        )}
      >
        <CheckCircle2
          className={cn(
            'h-4 w-4 flex-none',
            vipWins ? 'text-apple-blue' : 'text-apple-success',
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 text-sm text-apple-text">
          {vipWins ? (
            <>
              VIP 会员价更划算
              <span className="ml-1 text-apple-blue">
                -{formatPrice(applied.discount_amount)}
              </span>
              <span className="mt-0.5 block text-xs text-apple-text-2">
                「{applied.name}」已保留，下次还能用
              </span>
            </>
          ) : (
            <>
              已用「{applied.name}」
              <span className="ml-1 text-apple-success">
                -{formatPrice(applied.discount_amount)}
              </span>
            </>
          )}
        </span>
        <IconButton icon={X} label="取消优惠码" onClick={clear} className="-my-1.5 -mr-1.5" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void applyCode(code);
            }
          }}
          placeholder="优惠码（选填）"
          autoComplete="off"
          spellCheck={false}
          aria-label="优惠码"
          className={`${inputCls} font-mono`}
          disabled={busy}
        />
        <Button
          variant="secondary"
          size="md"
          loading={busy}
          disabled={!code.trim()}
          onClick={() => void applyCode(code)}
        >
          <Ticket className="h-4 w-4" aria-hidden />
          应用
        </Button>
      </div>

      {/* 可直接点选的券（本人「可使用」的券；未达门槛的置灰并标注门槛） */}
      {available.length > 0 && (
        <div className="mt-2">
          <p className="text-2xs text-apple-text-3">我领到的券（点一下直接使用）</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {available.map((c) => {
              const minAmount = Number(c.coupon.min_amount);
              const reached = orderTotal === undefined || orderTotal >= minAmount;
              return (
                <button
                  key={c.claim.id}
                  type="button"
                  disabled={busy || !reached}
                  onClick={() => void applyCode(c.claim.code)}
                  aria-label={`使用优惠券 ${c.coupon.name}`}
                  className={cn(
                    'inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
                    'pressable',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40',
                    reached
                      ? 'border-apple-danger/30 bg-apple-danger-soft text-apple-danger hover:border-apple-danger/60'
                      : 'border-apple-border bg-apple-bg text-apple-text-3',
                  )}
                >
                  <span className="truncate">{c.coupon.name}</span>
                  <span className="flex-none tabular-nums">{couponFaceText(c.coupon)}</span>
                  {!reached && (
                    <span className="flex-none text-2xs text-apple-text-3">
                      （{couponThresholdText(c.coupon)}）
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1.5 text-xs text-apple-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

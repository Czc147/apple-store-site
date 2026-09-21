'use client';

import { useState } from 'react';
import { CheckCircle2, Ticket, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { formatPrice } from '@/lib/format';
import type { OrderCreateItem } from '@/lib/order-types';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import { inputCls } from '@/components/admin/ui';

/** 应用成功的券（父组件据此调 /api/orders 的 coupon_code 与展示实付） */
export interface AppliedCoupon {
  code: string;
  name: string;
  discount_amount: number;
  payable: number;
  original_total: number;
}

/**
 * 优惠码输入框（愿望单结算 / 订阅结算共用）：
 * 输入 → POST /api/coupons/validate（服务端按目标现价重算原价 + 校验券）→
 * 通过后把结果交给父组件（父组件用它显示优惠/实付，并在下单时带上 coupon_code）。
 * 真正的权威校验在下单时再做一遍，这里只是预览。
 */
export default function CouponCodeInput({
  items,
  applied,
  onChange,
}: {
  /** 当前结算的商品行（与下单请求体一致） */
  items: OrderCreateItem[];
  applied: AppliedCoupon | null;
  onChange: (next: AppliedCoupon | null) => void;
}) {
  const { user, getAuthHeaders } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    const trimmed = code.trim();
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

  if (applied) {
    return (
      <div className="flex items-center gap-2 rounded-card border border-apple-success/25 bg-apple-success-soft px-3.5 py-2.5">
        <CheckCircle2 className="h-4 w-4 flex-none text-apple-success" aria-hidden />
        <span className="min-w-0 flex-1 text-sm text-apple-text">
          已用「{applied.name}」
          <span className="ml-1 text-apple-success">-{formatPrice(applied.discount_amount)}</span>
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
              void handleApply();
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
          onClick={() => void handleApply()}
        >
          <Ticket className="h-4 w-4" aria-hidden />
          应用
        </Button>
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-apple-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

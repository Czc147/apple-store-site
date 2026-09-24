'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Ticket, X } from 'lucide-react';
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

/**
 * 结算报价（父组件据此显示优惠/实付，并在下单时带 coupon_code）。
 *
 * 2026-09-24 从 `AppliedCoupon` 改名：现在它**可能不含券** ——
 * 用户没填券码、只吃会员折扣时也会产生一条报价（`auto: true`）。
 * 名字里继续带 "Coupon" 会让人误以为必有券码，这正是之前"折扣不显示"的成因之一。
 */
export interface AppliedQuote {
  /** 券码。**没填码、只吃会员折扣时为 undefined**（下单时不要带 coupon_code） */
  code?: string;
  /** 券名；无券时为 undefined */
  name?: string;
  /** **本单实际生效**的优惠金额（VIP 更划算时这里是 VIP 的额度） */
  discount_amount: number;
  payable: number;
  original_total: number;
  /**
   * 本单优惠实际来自券还是 VIP 折扣（迁移 023：两者不叠加，取更优）。
   * 两者都没有时为 null。
   */
  effective_source?: 'coupon' | 'vip' | null;
  /** 这张券自己的折扣额，用于 VIP 胜出时说明「券没被用掉」 */
  coupon_discount_amount?: number;
  vip?: { percent: number; discount_amount: number; better: boolean } | null;
  /**
   * 会员卡信息（带卡名），用于渲染**券下面那一列**「使用会员卡 · 金卡」。
   * 没有可用会员折扣时为 null / 缺省。
   */
  member_card?: {
    label: string;
    percent: number;
    discount_amount: number;
    effective: boolean;
  } | null;
  /**
   * true = 这条报价是**系统自动算的**（用户没填券码，吃的是会员折扣）。
   * 界面据此隐藏「取消」按钮 —— 没有码可取消。
   */
  auto?: boolean;
  /**
   * true = 这张券正被用户**自己**某笔未付款订单占着；下单时会自动作废那笔旧单、
   * 把券转过来。必须在**付款前**说清楚（流程是付款在前、推送在后）。
   */
  will_supersede?: boolean;
}

/**
 * 优惠码输入框 + 「可直接选券」快捷区 + **会员价自动报价**（愿望单结算 / 订阅结算共用）：
 * - 手输/粘贴 → POST /api/coupons/validate（服务端按目标现价重算原价 + 校验券）→
 *   通过后把结果交给父组件（父组件用它显示优惠/实付，并在下单时带上 coupon_code）
 * - **不填码时**也自动试算一次（`code` 选填）→ 有会员折扣就把 `auto` 报价交上去，
 *   用户不必填码也能看到「VIP 会员价 -¥X / 实付 ¥Y」
 * - 快捷区列出本人的券（**含被自己未付款订单占用中的**，后者标注原因），点一下即试算；
 *   未达门槛的券置灰并标注门槛（orderTotal 由父组件传入，用于这个提示）
 * 真正的权威校验在下单时再做一遍，这里只是预览（**不锁券**）。
 */
export default function CouponCodeInput({
  items,
  applied,
  onChange,
  orderTotal,
}: {
  /** 当前结算的商品行（与下单请求体一致） */
  items: OrderCreateItem[];
  applied: AppliedQuote | null;
  onChange: (next: AppliedQuote | null) => void;
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

  /**
   * 无券自动报价：不填券码也要显示会员折扣。
   *
   * ⚠️ 依赖用 `itemsKey`（字符串）而不是 `items` —— 父组件每次渲染都会新建那个数组，
   * 直接把 `items` 放进 deps 会无限循环请求。改这里前先想清楚这一条。
   */
  const itemsKey = JSON.stringify(items);
  useEffect(() => {
    if (!user || applied) return;
    let cancelled = false;
    const run = async () => {
      try {
        const headers = await getAuthHeaders();
        if (!headers.Authorization) return;
        const res = await fetch('/api/coupons/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ items }),
        });
        // 报价失败静默处理：下单时服务端还会再算一遍，不该因此打扰用户
        if (!res.ok) return;
        const data = (await res.json()) as AppliedQuote;
        if (cancelled) return;
        // 没有优惠就回 null，保持「无优惠只显示合计」的既有版式
        if (Number(data.discount_amount) > 0) {
          onChange({
            discount_amount: data.discount_amount,
            payable: data.payable,
            original_total: data.original_total,
            effective_source: data.effective_source ?? null,
            vip: data.vip ?? null,
            member_card: data.member_card ?? null,
            auto: true,
          });
        }
      } catch {
        /* 静默 */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, itemsKey, applied === null, getAuthHeaders]);

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
      const data = (await res.json().catch(() => ({}))) as AppliedQuote & {
        error?: string;
        /** 结构化券信息（新）；平铺的 code/name 是过渡期兼容字段 */
        coupon?: { code: string; name: string; will_supersede?: boolean } | null;
      };
      if (!res.ok) {
        setError(data.error ?? '优惠码不可用');
        onChange(null);
        return;
      }
      onChange({
        code: data.coupon?.code ?? data.code,
        name: data.coupon?.name ?? data.name,
        discount_amount: data.discount_amount,
        payable: data.payable,
        original_total: data.original_total,
        effective_source: data.effective_source ?? 'coupon',
        coupon_discount_amount: data.coupon_discount_amount,
        vip: data.vip ?? null,
        member_card: data.member_card ?? null,
        will_supersede: data.coupon?.will_supersede === true,
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

  /**
   * 可点选的券：**可用 + 被自己未付款订单占用中的**。
   * 占用中的也必须显示 —— 原来只筛 `available`，导致券在这里"静默消失"，
   * 用户在「我的券」里看得见、结算页却找不到，也不知道为什么。
   */
  const selectable = (mine ?? []).filter(
    (c) => c.status === 'available' || c.status === 'locked',
  );

  /**
   * 会员卡那一列（排在**券的下一列**）。
   * 只在有可用会员折扣时出现；带卡名，并标明本单是否已自动生效。
   */
  const memberCard = applied?.member_card ?? null;

  // ⚠️ 只有**用户自己选了券**时才用「已应用」框替换掉输入区。
  // 自动算出的会员价（auto）**绝不能**吞掉优惠券区域 —— 那样有会员卡的人
  // 就再也看不到、也点不到优惠券了（2026-09-24 踩过：这里原来只判 `applied`）。
  if (applied && !applied.auto) {
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
              {applied.will_supersede && (
                <span className="mt-0.5 block text-xs text-apple-text-2">
                  这张券被你的另一笔未付款订单占着，下单时会自动作废那笔订单
                </span>
              )}
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

      {/* 可直接点选的券（可用 + 占用中；未达门槛的置灰并标注门槛） */}
      {selectable.length > 0 && (
        <div className="mt-2">
          <p className="text-2xs text-apple-text-3">我领到的券（点一下直接使用）</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {selectable.map((c) => {
              const minAmount = Number(c.coupon.min_amount);
              const reached = orderTotal === undefined || orderTotal >= minAmount;
              const locked = c.status === 'locked';
              const usable = reached && !locked;
              return (
                <button
                  key={c.claim.id}
                  type="button"
                  disabled={busy || !reached}
                  onClick={() => void applyCode(c.claim.code)}
                  aria-label={
                    locked
                      ? `使用优惠券 ${c.coupon.name}（该券正被一笔未付款订单占用，使用后会作废那笔订单）`
                      : `使用优惠券 ${c.coupon.name}`
                  }
                  className={cn(
                    'inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
                    'pressable',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40',
                    usable
                      ? 'border-apple-danger/30 bg-apple-danger-soft text-apple-danger hover:border-apple-danger/60'
                      : 'border-apple-border bg-apple-bg text-apple-text-3',
                  )}
                >
                  <span className="truncate">{c.coupon.name}</span>
                  <span className="flex-none tabular-nums">{couponFaceText(c.coupon)}</span>
                  {locked && (
                    <span className="flex-none text-2xs text-apple-text-3">（占用中）</span>
                  )}
                  {!reached && !locked && (
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

      {/*
        会员卡：排在**券的下一列**。带卡名，并标明本单是否已自动生效。
        它与券不叠加、取更优（在服务端算），所以这里只做展示与说明 ——
        做成可点的"选项"反而会误导（让人以为自己可以不用会员价、多付钱）。
      */}
      {memberCard && (
        <div className="mt-2">
          <p className="text-2xs text-apple-text-3">会员卡</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
                memberCard.effective
                  ? 'border-apple-blue/30 bg-apple-blue-soft text-apple-blue'
                  : 'border-apple-border bg-apple-bg text-apple-text-3',
              )}
            >
              <CreditCard className="h-3.5 w-3.5 flex-none" aria-hidden />
              <span className="truncate">使用会员卡 · {memberCard.label}</span>
              <span className="flex-none tabular-nums">减 {memberCard.percent}%</span>
            </span>
            <span className="text-2xs text-apple-text-3">
              {memberCard.effective ? '本单已自动生效' : '本单用券更划算'}
            </span>
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

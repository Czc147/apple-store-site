'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { PAYMENT_METHOD, PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/lib/order-types';
import { formatPrice } from '@/lib/format';

/**
 * 结算支付方式区（复用主体）：
 * 显示总金额 → 「去微信支付 / 去支付宝支付」两键 → 点开显示后台配置的收款码图 →
 * 提示文案 → 「推送订单」（未登录跳登录；登录后 POST /api/orders）。
 *
 * 收款码为空（未配置 / Phase 3 占位）时展示「暂未开放」，禁止推送。
 * 由 CheckoutSheet（愿望单）与 SubscriptionCard（订阅）作为容器复用。
 */

const WEIXIN_BTN =
  'flex h-11 flex-1 items-center justify-center rounded-btn text-[14px] font-medium text-white transition-[background-color,transform] duration-200 ease-apple hover:opacity-95 active:scale-[0.98] disabled:opacity-60';
const ALIPAY_BTN =
  'flex h-11 flex-1 items-center justify-center rounded-btn text-[14px] font-medium text-white transition-[background-color,transform] duration-200 ease-apple hover:opacity-95 active:scale-[0.98] disabled:opacity-60';

interface PaymentMethodBodyProps {
  total: number;
  /** 组装 /api/orders 的请求体（不同上下文：愿望单 items / 订阅单条） */
  buildBody: (method: PaymentMethod) => Record<string, unknown>;
  /** 推送成功回调（返回订单号） */
  onSuccess: (orderNo: string) => void;
  /** 未登录时跳转登录页的 from 参数 */
  loginFrom: string;
}

export default function PaymentMethodBody({
  total,
  buildBody,
  onSuccess,
  loginFrom,
}: PaymentMethodBodyProps) {
  const { getAuthHeaders } = useAuth();

  const [qrMap, setQrMap] = useState<Record<string, string>>({ wechat: '', alipay: '' });
  const [qrLoading, setQrLoading] = useState(true);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/app-settings')
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        setQrMap({
          wechat: typeof data?.payment_wechat_qr_url === 'string' ? data.payment_wechat_qr_url : '',
          alipay: typeof data?.payment_alipay_qr_url === 'string' ? data.payment_alipay_qr_url : '',
        });
      })
      .catch(() => {
        /* 读不到收款码按未配置处理 */
      })
      .finally(() => {
        if (active) setQrLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectMethod = (m: PaymentMethod) => {
    setMethod(m);
    setError(null);
  };

  const qrUrl = method ? qrMap[method] : '';
  const qrAvailable = Boolean(qrUrl);

  const goLogin = () => {
    window.location.href = `/login?from=${encodeURIComponent(loginFrom)}`;
  };

  const handlePush = async () => {
    if (!method || pushing) return;
    if (!qrAvailable) {
      setError('收款码暂未开放，请稍后再试');
      return;
    }
    setPushing(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        goLogin();
        return;
      }
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(buildBody(method)),
      });
      if (res.status === 401) {
        goLogin();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string; order_no?: string };
      if (!res.ok) {
        setError(data.error ?? '推送失败，请稍后再试');
        return;
      }
      onSuccess(data.order_no ?? '');
    } catch {
      setError('网络异常，请稍后再试');
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 总金额 */}
      <div className="flex items-center justify-between rounded-card border border-apple-border bg-apple-bg px-4 py-3">
        <span className="text-[14px] text-apple-text-2">合计</span>
        <span className="text-[20px] font-semibold tabular-nums tracking-tight text-apple-text">
          {formatPrice(total)}
        </span>
      </div>

      {/* 微信 / 支付宝 两键 */}
      <div className="flex gap-3">
        <button
          type="button"
          className={`${WEIXIN_BTN} ${method === PAYMENT_METHOD.WECHAT ? 'ring-2 ring-[#07C160]' : 'bg-[#07C160]'}`}
          onClick={() => selectMethod(PAYMENT_METHOD.WECHAT)}
          aria-pressed={method === PAYMENT_METHOD.WECHAT}
        >
          {PAYMENT_METHOD_LABEL.wechat}支付
        </button>
        <button
          type="button"
          className={`${ALIPAY_BTN} ${method === PAYMENT_METHOD.ALIPAY ? 'ring-2 ring-[#1677FF]' : 'bg-[#1677FF]'}`}
          onClick={() => selectMethod(PAYMENT_METHOD.ALIPAY)}
          aria-pressed={method === PAYMENT_METHOD.ALIPAY}
        >
          {PAYMENT_METHOD_LABEL.alipay}支付
        </button>
      </div>

      {/* 收款码 */}
      {method && (
        <div className="flex flex-col items-center rounded-card border border-apple-border bg-apple-bg px-4 py-4">
          <p className="mb-3 text-[13px] text-apple-text-2">
            请使用{PAYMENT_METHOD_LABEL[method]}扫码支付
          </p>
          {qrLoading ? (
            <div className="skeleton h-40 w-40 rounded-lg" />
          ) : qrAvailable ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrUrl}
              alt={`${PAYMENT_METHOD_LABEL[method]}收款码`}
              className="h-40 w-40 rounded-lg border border-apple-hairline object-contain"
              loading="lazy"
            />
          ) : (
            <div className="flex h-40 w-40 flex-col items-center justify-center rounded-lg border border-dashed border-apple-border text-apple-text-3">
              <span className="text-[13px]">收款码暂未开放</span>
              <span className="mt-1 text-[11px]">请稍后再试</span>
            </div>
          )}
        </div>
      )}

      {/* 提示 + 推送 */}
      <p className="text-center text-[12px] leading-relaxed text-apple-text-3">
        付款后请点击「推送订单」至我们验证，我们稍后将卡密发往您的仓库
      </p>

      {error && (
        <p className="text-center text-[13px] text-[#D70015]" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void handlePush()}
        disabled={!method || pushing}
        className="w-full rounded-btn bg-apple-blue py-3 text-[15px] font-medium text-white transition-colors duration-200 ease-apple hover:bg-apple-blue-hover active:bg-apple-blue-active disabled:cursor-not-allowed disabled:bg-apple-border disabled:text-apple-text-3"
      >
        {pushing ? '推送中…' : '推送订单'}
      </button>
    </div>
  );
}

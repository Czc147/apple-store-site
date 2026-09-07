'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, Receipt, RefreshCw, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import { PageHeader } from '@/components/admin/ui';

interface Stats {
  total_orders: number;
  total_revenue: number;
  pending_orders: number;
  paid_orders: number;
  canceled_orders: number;
  today_orders: number;
  today_revenue: number;
  aov: number;
}

type Tone = 'blue' | 'green' | 'red' | 'purple';

const TONE_BG: Record<Tone, string> = {
  blue: 'bg-apple-blue-soft text-apple-blue',
  green: 'bg-[#E8F5E9] text-[#1B7F3B]',
  red: 'bg-[#FDECEE] text-[#B80012]',
  purple: 'bg-[#F3E8FF] text-[#5E3B8A]',
};

const CARD_ACCENT: Record<Tone, string> = {
  blue: 'bg-apple-blue',
  green: 'bg-[#1B7F3B]',
  red: 'bg-[#B80012]',
  purple: 'bg-[#5E3B8A]',
};

const int = (n: number) => n.toLocaleString('zh-CN');
const money = (n: number) =>
  `¥${n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;

function MetricCard({
  label,
  value,
  sub,
  tone,
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: Tone;
  icon: LucideIcon;
  href?: string;
}) {
  const body = (
    <>
      <div className={`absolute inset-x-0 top-0 h-1 ${CARD_ACCENT[tone]}`} aria-hidden />
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-apple-text-2">{label}</span>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full ${TONE_BG[tone]}`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div className="mt-3 text-[28px] font-bold leading-none tracking-tight text-apple-text tabular-nums">
        {value}
      </div>
      {sub && <div className="mt-2 text-[12.5px] text-apple-text-2">{sub}</div>}
    </>
  );

  const cls =
    'relative overflow-hidden rounded-card border border-apple-border bg-apple-card p-5 shadow-card transition hover:border-apple-blue/30';

  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** 后台「统计」页：总订单 / 累计收入 / 待确认 / 客单价 四指标卡 */
export default function StatsManager() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/stats');
      if (!res.ok) throw new Error(await extractError(res));
      setStats((await res.json()) as Stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader title="统计" description="订单经营概览（按已支付口径统计，今日按东八区自然日）" />

      {error ? (
        <div className="rounded-card border border-apple-border bg-apple-card p-8 text-center shadow-card">
          <p className="text-[14px] text-[#B80012]">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-btn border border-apple-border bg-white px-5 text-[14px] font-medium text-apple-text transition hover:bg-apple-bg"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            重试
          </button>
        </div>
      ) : loading || !stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((n) => (
            <div
              key={n}
              className="rounded-card border border-apple-border bg-apple-card p-5 shadow-card"
            >
              <div className="skeleton mb-4 h-4 w-16 rounded-md" />
              <div className="skeleton h-9 w-24 rounded-md" />
              <div className="skeleton mt-3 h-4 w-20 rounded-md" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="总订单数"
            value={int(stats.total_orders)}
            sub={`今日 +${int(stats.today_orders)}`}
            tone="blue"
            icon={Receipt}
            href="/admin/orders"
          />
          <MetricCard
            label="累计收入"
            value={money(stats.total_revenue)}
            sub={`今日 +${money(stats.today_revenue)}`}
            tone="green"
            icon={Wallet}
            href="/admin/orders"
          />
          <MetricCard
            label="待确认订单"
            value={int(stats.pending_orders)}
            sub={
              stats.pending_orders > 0 ? '点击前往核销' : '暂无待确认订单'
            }
            tone="red"
            icon={Clock}
            href="/admin/orders"
          />
          <MetricCard
            label="客单价"
            value={money(stats.aov)}
            sub={`已支付 ${int(stats.paid_orders)} 单`}
            tone="purple"
            icon={TrendingUp}
          />
        </div>
      )}
    </div>
  );
}

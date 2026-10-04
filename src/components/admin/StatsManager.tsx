'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Activity, RefreshCw } from 'lucide-react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import { PageHeader, Badge, TableShell, btnGhost, tdCls, thCls } from './ui';
import GlassSurface from '@/components/ui/GlassSurface';

interface RecentUser {
  id: string;
  email: string | null;
  display_name: string;
  avatar_key: string | null;
  avatar_url: string | null;
  last_active_at: string;
}

interface TrendPoint {
  date: string;
  orders: number;
  revenue: number;
  new_users: number;
}

interface Stats {
  generated_at: string;
  orders: {
    total: number;
    paid: number;
    pending: number;
    canceled: number;
    today: number;
    last_7_days: number;
    last_30_days: number;
    total_revenue: number;
    today_revenue: number;
    last_7_days_revenue: number;
    last_30_days_revenue: number;
    aov: number;
  };
  users: {
    total: number;
    today_new: number;
    last_7_days_new: number;
    recent: RecentUser[];
  };
  coupons: {
    claimed: number;
    used: number;
    locked: number;
    redemption_rate: number;
    discount_total: number;
  };
  content: {
    sub_units: number;
    visible_sub_units: number;
    activities: number;
    visible_activities: number;
    subscriptions: number;
    visible_subscriptions: number;
    daily_picks: number;
    visible_daily_picks: number;
    entitlements: number;
  };
  publications: {
    pending: number;
    published: number;
    failed: number;
    canceled: number;
  };
  trend: TrendPoint[];
}

const int = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString('zh-CN');

const money = (value: number | null | undefined) =>
  `¥${Number(value ?? 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function formatTime(value: string): string {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return '—';
  return new Date(time).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MiniTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/45 bg-white/55 p-4 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.35)]">
      <p className="text-[12.5px] font-medium text-apple-text-2">{label}</p>
      <p className="mt-2 text-[20px] font-semibold leading-none tracking-tight text-apple-text tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-2 text-[11.5px] text-apple-text-3">{hint}</p>}
    </div>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-apple-border bg-apple-card p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-apple-text">{title}</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-apple-text-2">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DefinitionRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-apple-hairline py-2.5 last:border-0">
      <span className="text-[13px] text-apple-text-2">{label}</span>
      <span className="text-[14px] font-medium text-apple-text tabular-nums">{value}</span>
    </div>
  );
}

function StateBadge({
  visible,
  total,
}: {
  visible: number;
  total: number;
}) {
  const tone = visible === total ? 'green' : visible === 0 ? 'gray' : 'amber';
  return (
    <Badge tone={tone}>
      {visible} / {total} 可见
    </Badge>
  );
}

/** 后台「数据中心」：交易、用户、券、内容与预上线的真实数据聚合 */
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
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const trend = useMemo(() => (stats?.trend ?? []).slice(-14), [stats]);
  const maxRevenue = useMemo(
    () => Math.max(...trend.map((point) => Number(point.revenue ?? 0)), 1),
    [trend],
  );

  return (
    <>
      <PageHeader
        title="数据中心"
        description="交易、用户、优惠券、内容与预上线状态统一在这里核对。"
        secondaryAction={
          <button type="button" onClick={load} disabled={loading} className={btnGhost}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            刷新
          </button>
        }
      />

      {error ? (
        <div className="rounded-card border border-[#F3C2C7] bg-[#FDF2F3] p-4 text-[13.5px] leading-relaxed text-[#810B17]">
          {error}
        </div>
      ) : loading || !stats ? (
        <div className="rounded-card border border-apple-border bg-apple-card p-5 shadow-card">
          <div className="skeleton h-6 w-40 rounded-md" />
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="skeleton h-20 rounded-2xl" />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <GlassSurface tint="prism" radius="hero" sweep>
            <div className="p-5 md:p-7">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex items-center gap-2 text-[14px] font-semibold text-apple-text">
                  <Activity className="h-4 w-4" aria-hidden />
                  交易脉冲 · 近 14 天实付
                </div>
                <span className="text-[11.5px] text-apple-text-3">
                  东八区自然日 · 更新 {formatTime(stats.generated_at)}
                </span>
              </div>

              <div className="mt-4 rounded-premium border border-white/45 bg-white/50 p-4 md:p-5">
                <div className="flex h-40 items-end gap-1.5 md:h-48">
                  {trend.map((point) => (
                    <div
                      key={point.date}
                      className="group flex h-full flex-1 flex-col justify-end"
                      title={`${point.date} · 实付 ${money(point.revenue)} · 订单 ${int(point.orders)} · 新用户 ${int(point.new_users)}`}
                    >
                      <div
                        className="w-full rounded-t-[6px] bg-apple-text/85 transition-all duration-500 ease-out group-hover:bg-apple-text"
                        style={{ height: `${Math.max((Number(point.revenue ?? 0) / maxRevenue) * 100, point.revenue > 0 ? 4 : 1)}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[10.5px] text-apple-text-3">
                  <span>{trend[0]?.date ?? '—'}</span>
                  <span>{trend[trend.length - 1]?.date ?? '—'}</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <MiniTile label="近 7 天实付" value={money(stats.orders.last_7_days_revenue)} hint={`30 天 ${money(stats.orders.last_30_days_revenue)}`} />
                <MiniTile label="累计实付" value={money(stats.orders.total_revenue)} hint={`客单价 ${money(stats.orders.aov)}`} />
                <MiniTile
                  label="待上线内容"
                  value={int(stats.publications.pending)}
                  hint={stats.publications.failed > 0 ? `${int(stats.publications.failed)} 个失败` : '暂无失败'}
                />
                <MiniTile label="券核销率" value={`${Number(stats.coupons.redemption_rate ?? 0).toFixed(2)}%`} hint={`已领 ${int(stats.coupons.claimed)} 张`} />
              </div>
            </div>
          </GlassSurface>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="订单" description="实付收入已扣除订单优惠金额，不再使用原价 total 口径。">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <DefinitionRow label="累计订单" value={int(stats.orders.total)} />
                  <DefinitionRow label="已确认" value={int(stats.orders.paid)} />
                  <DefinitionRow label="待确认" value={int(stats.orders.pending)} />
                  <DefinitionRow label="已取消" value={int(stats.orders.canceled)} />
                </div>
                <div>
                  <DefinitionRow label="今日订单" value={int(stats.orders.today)} />
                  <DefinitionRow label="7 天订单" value={int(stats.orders.last_7_days)} />
                  <DefinitionRow label="30 天订单" value={int(stats.orders.last_30_days)} />
                  <DefinitionRow label="30 天实付" value={money(stats.orders.last_30_days_revenue)} />
                </div>
              </div>
            </Section>

            <Section
              title="用户"
              description="注册与最近活跃来自 Supabase Auth，资料昵称来自 profiles。"
              action={
                <Link href="/admin/users" className="text-[13px] font-medium text-apple-blue hover:text-apple-blue-hover">
                  账号管理
                </Link>
              }
            >
              <div className="mb-4 grid grid-cols-3 gap-3">
                <MiniTile label="总用户" value={int(stats.users.total)} />
                <MiniTile label="今日新增" value={int(stats.users.today_new)} />
                <MiniTile label="7 天新增" value={int(stats.users.last_7_days_new)} />
              </div>
              {stats.users.recent.length === 0 ? (
                <p className="rounded-xl bg-apple-bg px-3 py-2.5 text-[13px] text-apple-text-3">暂无用户</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {stats.users.recent.map((user) => (
                    <li key={user.id} className="flex items-center justify-between gap-3 rounded-xl bg-apple-bg px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-apple-text">{user.display_name}</p>
                        <p className="truncate text-[12px] text-apple-text-3">{user.email ?? user.id}</p>
                      </div>
                      <span className="shrink-0 text-[12px] text-apple-text-3">{formatTime(user.last_active_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="优惠券" description="锁定数 = 未核销且被 pending 订单占用的专属码。">
              <div>
                <DefinitionRow label="累计领取" value={int(stats.coupons.claimed)} />
                <DefinitionRow label="已使用" value={int(stats.coupons.used)} />
                <DefinitionRow label="锁定中" value={int(stats.coupons.locked)} />
                <DefinitionRow label="核销率" value={`${Number(stats.coupons.redemption_rate ?? 0).toFixed(2)}%`} />
                <DefinitionRow label="已核销订单折扣总额" value={money(stats.coupons.discount_total)} />
              </div>
            </Section>

            <Section
              title="内容与预上线"
              description="隐藏内容不会出现在前台列表、详情、搜索或正文接口。"
              action={
                <Link href="/admin/prelaunch" className="text-[13px] font-medium text-apple-blue hover:text-apple-blue-hover">
                  预上线管理
                </Link>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-apple-hairline p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] text-apple-text-2">小单元</span>
                    <StateBadge visible={stats.content.visible_sub_units} total={stats.content.sub_units} />
                  </div>
                </div>
                <div className="rounded-xl border border-apple-hairline p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] text-apple-text-2">活动</span>
                    <StateBadge visible={stats.content.visible_activities} total={stats.content.activities} />
                  </div>
                </div>
                <div className="rounded-xl border border-apple-hairline p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] text-apple-text-2">订阅</span>
                    <StateBadge visible={stats.content.visible_subscriptions} total={stats.content.subscriptions} />
                  </div>
                </div>
                <div className="rounded-xl border border-apple-hairline p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] text-apple-text-2">每日推荐</span>
                    <StateBadge visible={stats.content.visible_daily_picks} total={stats.content.daily_picks} />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge tone="blue">{int(stats.publications.pending)} 待上线</Badge>
                <Badge tone="green">{int(stats.publications.published)} 已上线</Badge>
                {stats.publications.failed > 0 && <Badge tone="red">{int(stats.publications.failed)} 失败</Badge>}
                {stats.publications.canceled > 0 && <Badge tone="gray">{int(stats.publications.canceled)} 已取消</Badge>}
                <span className="text-[12.5px] text-apple-text-3">用户权益 {int(stats.content.entitlements)} 条</span>
              </div>
            </Section>
          </div>

          <Section title="交易明细状态" description="待确认订单需要尽快处理，取消订单保留用于审计。">
            <TableShell>
              <thead>
                <tr>
                  <th className={thCls}>状态</th>
                  <th className={thCls}>数量</th>
                  <th className={thCls}>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={tdCls}><Badge tone="amber">待确认</Badge></td>
                  <td className={tdCls}>{int(stats.orders.pending)}</td>
                  <td className={tdCls}>用户已推送，等待收款确认与派发</td>
                </tr>
                <tr>
                  <td className={tdCls}><Badge tone="green">已确认</Badge></td>
                  <td className={tdCls}>{int(stats.orders.paid)}</td>
                  <td className={tdCls}>已确认收款，实付收入计入统计</td>
                </tr>
                <tr>
                  <td className={tdCls}><Badge tone="gray">已取消</Badge></td>
                  <td className={tdCls}>{int(stats.orders.canceled)}</td>
                  <td className={tdCls}>用户取消或超时关闭，不计入收入</td>
                </tr>
              </tbody>
            </TableShell>
          </Section>
        </div>
      )}
    </>
  );
}

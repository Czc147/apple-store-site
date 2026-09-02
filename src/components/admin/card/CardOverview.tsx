'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Gauge } from 'lucide-react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import type { CardKeyStats } from '@/lib/card-types';
import {
  TableShell,
  LoadingRows,
  EmptyRow,
  btnGhost,
  btnPrimary,
  thCls,
  tdCls,
} from '../ui';

/** GET /api/card-management/stats 全局模式响应 */
interface GlobalStats {
  total: CardKeyStats;
  by_product: Array<{
    card_product_id: string;
    description: string | null;
    target_name: string | null;
    total: number;
    unused: number;
    issued: number;
    void: number;
  }>;
}

/** 单个指标卡 */
function StatCard({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: number;
  hint?: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-card border border-apple-border bg-apple-card p-5 shadow-card">
      <p className="text-[13px] text-apple-text-2">{label}</p>
      {loading ? (
        <div className="skeleton mt-2 h-8 w-16 rounded-md" />
      ) : (
        <p className="mt-1 text-[28px] font-bold leading-tight tabular-nums text-apple-text">
          {value}
        </p>
      )}
      {hint && <p className="mt-1 text-[12px] text-apple-text-3">{hint}</p>}
    </div>
  );
}

/**
 * 发卡概览：
 * - 指标卡：卡密商品数 / 卡密总数 / 已发放 / 剩余库存（未使用）/ 今日已发放
 * - 各商品库存明细表（带「查看卡密 / 导入」快捷入口）
 * 数据来源：/api/card-management/stats（全局）+ products 计数 +
 * keys?status=issued&issued_from=今天 的 total（今日发放数）。
 */
export default function CardOverview() {
  const router = useRouter();
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [productCount, setProductCount] = useState(0);
  const [todayIssued, setTodayIssued] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      // 本地时区的今天（YYYY-MM-DD），后端按 issued_at >= 当日 00:00 统计
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;

      const [statsRes, productsRes, todayRes] = await Promise.all([
        adminFetch('/api/card-management/stats'),
        adminFetch('/api/card-management/products'),
        adminFetch(
          `/api/card-management/keys?status=issued&issued_from=${today}&page=1&page_size=1`,
        ),
      ]);
      if (!statsRes.ok) throw new Error(await extractError(statsRes));
      if (!productsRes.ok) throw new Error(await extractError(productsRes));
      if (!todayRes.ok) throw new Error(await extractError(todayRes));

      setStats((await statsRes.json()) as GlobalStats);
      setProductCount(((await productsRes.json()) as unknown[]).length);
      setTodayIssued(((await todayRes.json()) as { total: number }).total ?? 0);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
      setStats(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const total = stats?.total;

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-bold leading-tight text-apple-text">
            <Gauge className="h-5 w-5 text-apple-blue" aria-hidden />
            发卡概览
          </h1>
          <p className="mt-1 text-[13px] text-apple-text-2">
            卡密商品的库存与发放情况一览，可从这里快速导入、查看或登记取卡
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/card-management/products/new"
            className={btnGhost}
          >
            新建商品
          </Link>
          <Link href="/admin/card-management/keys/import" className={btnGhost}>
            批量导入
          </Link>
          <Link href="/admin/card-management/deliveries" className={btnPrimary}>
            登记取卡
          </Link>
        </div>
      </header>

      {loadError ? (
        <div className="rounded-card border border-apple-border bg-apple-card p-6 text-center shadow-card">
          <p className="text-[14px] leading-relaxed text-apple-text-2">{loadError}</p>
          <button type="button" onClick={() => void load()} className={`${btnGhost} mt-4`}>
            重试
          </button>
        </div>
      ) : (
        <>
          {/* 指标卡 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="卡密商品" value={productCount} loading={!stats} />
            <StatCard label="卡密总数" value={total?.total ?? 0} loading={!stats} />
            <StatCard label="已发放" value={total?.issued ?? 0} loading={!stats} />
            <StatCard
              label="剩余库存"
              value={total?.unused ?? 0}
              hint="未使用，可继续发放"
              loading={!stats}
            />
            <StatCard
              label="今日已发放"
              value={todayIssued}
              hint="按本地时区统计"
              loading={!stats}
            />
          </div>

          {/* 各商品库存明细 */}
          <h2 className="mb-3 mt-8 text-[16px] font-semibold text-apple-text">
            各商品库存
          </h2>
          <TableShell>
            <thead>
              <tr>
                <th className={thCls}>商品</th>
                <th className={thCls}>卡密总数</th>
                <th className={thCls}>未使用</th>
                <th className={thCls}>已发放</th>
                <th className={thCls}>已作废</th>
                <th className={thCls}>操作</th>
              </tr>
            </thead>
            <tbody>
              {!stats ? (
                <LoadingRows colSpan={6} />
              ) : stats.by_product.length === 0 ? (
                <EmptyRow
                  colSpan={6}
                  text="还没有卡密商品，新建后即可导入卡密"
                  createLabel="新建卡密商品"
                  onCreate={() => router.push('/admin/card-management/products/new')}
                />
              ) : (
                stats.by_product.map((row) => (
                  <tr key={row.card_product_id} className="transition hover:bg-apple-bg/60">
                    <td className={tdCls}>
                      <p className="font-medium">
                        {row.target_name ?? '（关联对象已删除）'}
                      </p>
                      {row.description && (
                        <p className="mt-0.5 max-w-[280px] truncate text-[12px] text-apple-text-3">
                          {row.description}
                        </p>
                      )}
                    </td>
                    <td className={`${tdCls} tabular-nums`}>{row.total}</td>
                    <td className={`${tdCls} tabular-nums text-[#1B7F3B]`}>{row.unused}</td>
                    <td className={`${tdCls} tabular-nums text-apple-blue`}>{row.issued}</td>
                    <td className={`${tdCls} tabular-nums text-apple-text-3`}>{row.void}</td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-4">
                        <Link
                          href={`/admin/card-management/keys?product=${row.card_product_id}`}
                          className="text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
                        >
                          查看卡密
                        </Link>
                        <Link
                          href={`/admin/card-management/keys/import?product=${row.card_product_id}`}
                          className="text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
                        >
                          导入
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </>
      )}
    </>
  );
}

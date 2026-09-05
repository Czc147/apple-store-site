'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import { formatDateTime } from '@/lib/format';
import { TARGET_TYPE_LABEL, REDEEM_TYPE_LABEL } from '@/lib/card-types';
import {
  PageHeader,
  TableShell,
  LoadingRows,
  EmptyRow,
  Notice,
  Badge,
  selectCls,
  btnGhost,
  thCls,
  tdCls,
} from '../ui';
import ConfirmDialog from '../ConfirmDialog';
import { productLabel, type CardProductRow } from './shared';

/**
 * 卡密商品管理（列表）：
 * - 支持按启用状态筛选
 * - 每行显示关联对象（小单元/活动/订阅）+ 分组名、库存统计、启用状态
 * - 行内操作：编辑 / 导入卡密 / 启用禁用切换 / 删除
 *   （无卡密可直接删；仅有未使用/已作废卡密时确认后连带清空；
 *     有已发放卡密或取卡登记时后端仍会拦截）
 */
export default function CardProductsManager() {
  const router = useRouter();
  const [rows, setRows] = useState<CardProductRow[] | null>(null);
  const [filterEnabled, setFilterEnabled] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<CardProductRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const showNotice = useCallback((okFlag: boolean, text: string) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice({ ok: okFlag, text });
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await adminFetch('/api/card-management/products?include_stats=1');
      if (!res.ok) throw new Error(await extractError(res));
      setRows((await res.json()) as CardProductRow[]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
      setRows(null);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, [load]);

  const visible =
    rows === null
      ? null
      : rows.filter((r) =>
          filterEnabled === '' ? true : String(r.enabled) === filterEnabled,
        );

  /** 启用 / 禁用切换（局部更新 enabled 字段） */
  const handleToggleEnabled = async (row: CardProductRow) => {
    try {
      const res = await adminFetch(`/api/card-management/products/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      showNotice(true, !row.enabled ? '已启用' : '已禁用');
      await load();
    } catch (e) {
      showNotice(false, e instanceof Error ? e.message : '操作失败');
    }
  };

  /** 待删商品的库存分支：仅有未使用/已作废卡密时可连带清空 */
  const deletingStats = deleting?.stats;
  const removableKeyCount = deletingStats
    ? deletingStats.unused + deletingStats.void
    : 0;
  const cascadeCase = Boolean(
    deletingStats && deletingStats.issued === 0 && removableKeyCount > 0,
  );

  const handleDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const url = cascadeCase
        ? `/api/card-management/products/${deleting.id}?cascade_keys=1`
        : `/api/card-management/products/${deleting.id}`;
      const res = await adminFetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error(await extractError(res));
      const result = (await res.json()) as { deleted_keys?: number };
      setDeleting(null);
      showNotice(
        true,
        result.deleted_keys ? `已删除（同时清空 ${result.deleted_keys} 张卡密）` : '已删除',
      );
      await load();
    } catch (e) {
      showNotice(false, e instanceof Error ? e.message : '删除失败');
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="卡密商品"
        description="每个卡密商品与一个对象（小单元 / 活动 / 订阅）1:1 关联；商品下管理卡密库存与取卡发放"
        createLabel="新建商品"
        onCreate={() => router.push('/admin/card-management/products/new')}
      />

      {/* 按启用状态筛选 */}
      <div className="mb-4 flex items-center gap-2.5">
        <label htmlFor="filter-enabled" className="shrink-0 text-[13px] text-apple-text-2">
          按状态筛选
        </label>
        <select
          id="filter-enabled"
          className={`${selectCls} w-40`}
          value={filterEnabled}
          onChange={(e) => setFilterEnabled(e.target.value)}
        >
          <option value="">全部</option>
          <option value="true">已启用</option>
          <option value="false">已禁用</option>
        </select>
      </div>

      {loadError ? (
        <div className="rounded-card border border-apple-border bg-apple-card p-6 text-center shadow-card">
          <p className="text-[14px] leading-relaxed text-apple-text-2">{loadError}</p>
          <button type="button" onClick={() => void load()} className={`${btnGhost} mt-4`}>
            重试
          </button>
        </div>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th className={thCls}>排序</th>
              <th className={thCls}>关联对象</th>
              <th className={thCls}>兑换类型</th>
              <th className={thCls}>描述</th>
              <th className={thCls}>状态</th>
              <th className={thCls}>库存</th>
              <th className={thCls}>创建时间</th>
              <th className={thCls}>操作</th>
            </tr>
          </thead>
          <tbody>
            {visible === null ? (
              <LoadingRows colSpan={8} />
            ) : visible.length === 0 ? (
              <EmptyRow
                colSpan={8}
                text={
                  rows?.length
                    ? '当前筛选条件下没有卡密商品'
                    : '还没有卡密商品，新建后即可导入卡密'
                }
                createLabel="新建商品"
                onCreate={() => router.push('/admin/card-management/products/new')}
              />
            ) : (
              visible.map((row) => (
                <tr key={row.id} className="transition hover:bg-apple-bg/60">
                  <td className={tdCls}>{row.sort_order}</td>
                  <td className={tdCls}>
                    {row.target_type && row.target_id ? (
                      <>
                        <p className="flex items-center gap-1.5 font-medium">
                          <span className="shrink-0 rounded-full bg-apple-bg px-2 py-0.5 text-[11px] text-apple-text-2">
                            {TARGET_TYPE_LABEL[row.target_type]}
                          </span>
                          {row.target_name ?? '（关联对象已删除）'}
                        </p>
                        {row.group_name && (
                          <p className="mt-0.5 text-[12px] text-apple-text-3">
                            {row.group_name}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-apple-text-3">（未关联）</p>
                        <p className="mt-0.5 text-[12px] text-[#B80012]">
                          关联对象已删除，商品已被自动禁用
                        </p>
                      </>
                    )}
                  </td>
                  <td className={tdCls}>
                    <Badge tone={row.redeem_type === 'unlock_daily' ? 'blue' : 'gray'}>
                      {REDEEM_TYPE_LABEL[row.redeem_type] ?? row.redeem_type}
                    </Badge>
                    {row.redeem_type === 'unlock_daily' && (
                      <p className="mt-0.5 whitespace-nowrap text-[12px] text-apple-text-3">
                        {typeof row.unlock_duration_days === 'number'
                          ? `${row.unlock_duration_days} 天`
                          : '永久'}
                      </p>
                    )}
                  </td>
                  <td className={tdCls}>
                    <span className="block max-w-[220px] truncate text-apple-text-2">
                      {row.description ?? '—'}
                    </span>
                  </td>
                  <td className={tdCls}>
                    <Badge tone={row.enabled ? 'green' : 'gray'}>
                      {row.enabled ? '启用' : '禁用'}
                    </Badge>
                  </td>
                  <td className={tdCls}>
                    <p className="tabular-nums">{row.stats?.total ?? 0} 条</p>
                    <p className="mt-0.5 whitespace-nowrap text-[12px] text-apple-text-3">
                      未用 {row.stats?.unused ?? 0} · 已发 {row.stats?.issued ?? 0} · 作废{' '}
                      {row.stats?.void ?? 0}
                    </p>
                  </td>
                  <td className={`${tdCls} whitespace-nowrap text-apple-text-2`}>
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-4 whitespace-nowrap">
                      <Link
                        href={`/admin/card-management/products/${row.id}`}
                        className="text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
                      >
                        编辑
                      </Link>
                      <Link
                        href={`/admin/card-management/keys/import?product=${row.id}`}
                        className="text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
                      >
                        导入
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleToggleEnabled(row)}
                        className="text-[13px] font-medium text-apple-text-2 transition hover:text-apple-text"
                      >
                        {row.enabled ? '禁用' : '启用'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(row)}
                        className="text-[13px] font-medium text-[#D70015] transition hover:opacity-80"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="删除卡密商品"
        message={
          deleting
            ? cascadeCase
              ? `确定要删除卡密商品「${productLabel(deleting)}」吗？将同时清空其下 ${removableKeyCount} 张卡密（未使用 ${
                  deletingStats?.unused ?? 0
                } · 作废 ${deletingStats?.void ?? 0}）。此操作不可恢复。`
              : `确定要删除卡密商品「${productLabel(deleting)}」吗？此操作不可恢复。`
            : ''
        }
        note={
          deletingStats && deletingStats.issued > 0
            ? `该商品下有 ${deletingStats.issued} 张已发放卡密，无法删除；如不再使用建议改为禁用。`
            : cascadeCase
              ? '仅清空未使用 / 已作废卡密；若存在取卡登记仍会拦截删除。'
              : '商品下仍有卡密或取卡登记时将无法删除；如不再使用建议改为禁用。'
        }
        busy={deleteBusy}
        onConfirm={handleDelete}
        onClose={() => {
          if (!deleteBusy) setDeleting(null);
        }}
      />

      <Notice notice={notice} />
    </>
  );
}

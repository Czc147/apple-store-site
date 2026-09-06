'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Order, OrderItem } from '@/lib/order-types';
import {
  ORDER_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  ORDER_STATUS_LABEL,
} from '@/lib/order-types';
import { formatPrice } from '@/lib/format';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';
import {
  PageHeader,
  TableShell,
  Badge,
  BadgeTone,
  LoadingRows,
  EmptyRow,
  Notice,
  Pagination,
  btnGhost,
  btnPrimary,
  thCls,
  tdCls,
} from './ui';

type TypeFilter = 'all' | 'sub_unit' | 'subscription';
type StatusFilter = 'all' | 'pending' | 'paid' | 'canceled';

interface OrderRow extends Order {
  items: OrderItem[];
}

const STATUS_TONE: Record<Order['status'], BadgeTone> = {
  pending: 'amber',
  paid: 'green',
  canceled: 'gray',
};

const TYPE_TABS: Array<{ key: TypeFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'sub_unit', label: '小单元' },
  { key: 'subscription', label: '订阅' },
];

const STATUS_TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: '全部状态' },
  { key: 'pending', label: '待确认' },
  { key: 'paid', label: '已确认' },
  { key: 'canceled', label: '已取消' },
];

const PAGE_SIZE = 20;

const tabCls = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
    active ? 'bg-apple-blue text-white' : 'bg-apple-bg text-apple-text-2'
  }`;

export default function OrdersManager() {
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const [action, setAction] = useState<{ kind: 'confirm' | 'cancel'; order: OrderRow } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const showNotice = useCallback((okFlag: boolean, text: string) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice({ ok: okFlag, text });
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (type !== 'all') params.set('type', type);
      if (status !== 'all') params.set('status', status);
      const res = await adminFetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error(await extractError(res));
      const data = (await res.json()) as { items: OrderRow[]; total: number };
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
      setRows(null);
    }
  }, [page, type, status]);

  useEffect(() => {
    void load();
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, [load]);

  const handleConfirm = async () => {
    if (!action || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await adminFetch(`/api/orders/${action.order.id}/confirm`, { method: 'POST' });
      if (!res.ok) throw new Error(await extractError(res));
      setAction(null);
      showNotice(true, `订单 ${action.order.order_no} 已确认并派发`);
      await load();
    } catch (err) {
      showNotice(false, err instanceof Error ? err.message : '确认失败');
      setAction(null);
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!action || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await adminFetch(`/api/orders/${action.order.id}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error(await extractError(res));
      setAction(null);
      showNotice(true, `订单 ${action.order.order_no} 已取消`);
      await load();
    } catch (err) {
      showNotice(false, err instanceof Error ? err.message : '取消失败');
      setAction(null);
    } finally {
      setActionBusy(false);
    }
  };

  const highlight = (status: Order['status']) => status === 'pending';
  const totalQty = (row: OrderRow) => row.items.reduce((s, it) => s + it.quantity, 0);

  return (
    <>
      <PageHeader
        title="订单管理"
        description="用户推送订单 → 核实收款码到账 → 确认收款并自动派发卡密到用户仓库"
      />

      {/* 筛选：类型 Tab + 状态 Tab */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-2">
          {TYPE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={tabCls(type === t.key)}
              onClick={() => {
                setType(t.key);
                setPage(1);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={tabCls(status === t.key)}
              onClick={() => {
                setStatus(t.key);
                setPage(1);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
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
              <th className={thCls}>订单号</th>
              <th className={thCls}>类型</th>
              <th className={thCls}>商品</th>
              <th className={thCls}>买家</th>
              <th className={thCls}>金额</th>
              <th className={thCls}>支付</th>
              <th className={thCls}>状态</th>
              <th className={thCls}>时间</th>
              <th className={thCls}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <LoadingRows colSpan={9} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={9} text="暂无订单" />
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={`transition hover:bg-apple-bg/60 ${
                    highlight(row.status) ? 'bg-apple-blue/5' : ''
                  }`}
                >
                  <td className={tdCls}>
                    <span className="whitespace-nowrap font-mono text-[13px] text-apple-text">
                      {row.order_no}
                    </span>
                  </td>
                  <td className={tdCls}>
                    <Badge tone="blue">{ORDER_TYPE_LABEL[row.type]}</Badge>
                  </td>
                  <td className={tdCls}>
                    <ul className="max-w-[240px] space-y-0.5">
                      {row.items.map((it) => (
                        <li key={it.id} className="truncate text-[13px] text-apple-text-2">
                          {it.name} ×{it.quantity}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className={tdCls}>
                    <span className="whitespace-nowrap text-[13px] text-apple-text-2">
                      {row.user_email ?? '—'}
                    </span>
                  </td>
                  <td className={tdCls}>
                    <span className="whitespace-nowrap tabular-nums text-[14px] font-medium">
                      ¥{formatPrice(Number(row.total))}
                    </span>
                  </td>
                  <td className={tdCls}>
                    <span className="text-[13px] text-apple-text-2">
                      {PAYMENT_METHOD_LABEL[row.payment_method]}
                    </span>
                  </td>
                  <td className={tdCls}>
                    <Badge tone={STATUS_TONE[row.status]}>
                      {ORDER_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className={`${tdCls} whitespace-nowrap text-[13px] text-apple-text-2`}>
                    {new Date(row.created_at).toLocaleString('zh-CN')}
                  </td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-3">
                      {row.status === 'pending' && (
                        <button
                          type="button"
                          className={`${btnPrimary} h-8 px-3 text-[13px]`}
                          onClick={() => setAction({ kind: 'confirm', order: row })}
                        >
                          确认收款
                        </button>
                      )}
                      {row.status === 'paid' && (
                        <button
                          type="button"
                          className="text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
                          onClick={() => setAction({ kind: 'confirm', order: row })}
                        >
                          重新派发
                        </button>
                      )}
                      {row.status !== 'canceled' && (
                        <button
                          type="button"
                          className="text-[13px] font-medium text-[#D70015] transition hover:opacity-80"
                          onClick={() => setAction({ kind: 'cancel', order: row })}
                        >
                          取消
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onChange={(p) => setPage(p)}
      />

      {/* 确认收款：正向操作，用主色按钮 */}
      <Modal
        open={action?.kind === 'confirm'}
        title="确认收款并派发"
        onClose={() => {
          if (!actionBusy) setAction(null);
        }}
        footer={
          <>
            <button
              type="button"
              className={btnGhost}
              onClick={() => setAction(null)}
              disabled={actionBusy}
            >
              取消
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={handleConfirm}
              disabled={actionBusy}
            >
              {actionBusy ? '派发中…' : '确认收款'}
            </button>
          </>
        }
      >
        {action && (
          <p className="text-[14px] leading-relaxed text-apple-text">
            确认已收到订单「{action.order.order_no}」的付款吗？确认后将自动派发{' '}
            {totalQty(action.order)} 件内容到买家仓库（库存不足会被拦截）。
          </p>
        )}
      </Modal>

      {/* 取消订单：危险操作，红色按钮 */}
      <ConfirmDialog
        open={action?.kind === 'cancel'}
        title="取消订单"
        busy={actionBusy}
        confirmText="取消订单"
        message={
          action
            ? `确定要取消订单「${action.order.order_no}」吗？取消后买家无法收到卡密。`
            : ''
        }
        onConfirm={handleCancel}
        onClose={() => {
          if (!actionBusy) setAction(null);
        }}
      />

      <Notice notice={notice} />
    </>
  );
}

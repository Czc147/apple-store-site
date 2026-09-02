'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import { formatDateTime, maskTail } from '@/lib/format';
import {
  CARD_KEY_STATUS_LABEL,
  type CardKeyAction,
  type CardKeyStatus,
} from '@/lib/card-types';
import CopyButton from '../CopyButton';
import ConfirmDialog from '../ConfirmDialog';
import {
  PageHeader,
  TableShell,
  LoadingRows,
  EmptyRow,
  Notice,
  Pagination,
  Badge,
  inputCls,
  selectCls,
  btnPrimary,
  btnGhost,
  thCls,
  tdCls,
  type BadgeTone,
} from '../ui';
import { productLabel, type CardKeyRow, type CardProductRow } from './shared';

/** GET /api/card-management/keys 响应 */
interface KeysResponse {
  items: CardKeyRow[];
  total: number;
  page: number;
  page_size: number;
}

interface Filters {
  productId: string;
  status: string;
  orderId: string;
  issuedFrom: string;
  issuedTo: string;
}

const EMPTY_FILTERS: Filters = {
  productId: '',
  status: '',
  orderId: '',
  issuedFrom: '',
  issuedTo: '',
};

const PAGE_SIZE = 20;

/** 状态 → 徽章配色 */
const STATUS_TONE: Record<CardKeyStatus, BadgeTone> = {
  unused: 'green',
  issued: 'blue',
  void: 'red',
};

/** 各状态可执行的动作（与后端状态机保持一致） */
const ACTIONS_BY_STATUS: Record<CardKeyStatus, CardKeyAction[]> = {
  unused: ['void'],
  issued: ['reissue', 'void'],
  void: ['restore'],
};

const ACTION_LABEL: Record<CardKeyAction, string> = {
  void: '作废',
  restore: '恢复',
  reissue: '重新发放',
};

/** 危险幽灵按钮（清空卡密等批量破坏性操作） */
const btnDangerGhost =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-btn border border-[#F3C8CD] bg-white px-5 text-[14px] font-medium text-[#D70015] hover:bg-[#FDECEE] active:scale-[0.98] [transition:transform_100ms_cubic-bezier(0.4,0,0.2,1),background-color_200ms_cubic-bezier(0.4,0,0.2,1),opacity_200ms_cubic-bezier(0.4,0,0.2,1)] disabled:pointer-events-none disabled:opacity-50';

/** 二次确认弹窗文案 */
const ACTION_CONFIRM: Record<CardKeyAction, { title: string; note: string }> = {
  void: {
    title: '作废卡密',
    note: '作废后不再参与发放（常用于坏卡 / 售后回收），可随时恢复。',
  },
  restore: {
    title: '恢复卡密',
    note: '恢复后回到「未使用」状态，将重新参与发放。',
  },
  reissue: {
    title: '重新发放卡密',
    note: '用于售后补发：卡密将清空订单关联并回到「未使用」池，等待下一次发放。',
  },
};

/** 小标签容器（筛选区字段） */
function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-apple-text-2">{label}</span>
      {children}
    </label>
  );
}

/**
 * 卡密库存管理：
 * - 筛选：商品 / 状态 / 订单号 / 发放时间范围（服务端分页，20 条/页）
 * - 卡密内容默认遮罩（****末 4 位），点击眼睛图标明文显示并可复制
 * - 状态操作：作废 / 恢复 / 重新发放，均需二次确认
 * - 支持 ?product=xxx URL 参数预选商品（概览/商品页跳转携带）
 */
export default function CardKeysManager() {
  const router = useRouter();

  const [products, setProducts] = useState<CardProductRow[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  /** 订单号输入框单独管理，回车 / 点「查询」才应用 */
  const [orderIdInput, setOrderIdInput] = useState('');
  const [page, setPage] = useState(1);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<KeysResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** 已明文展示的卡密 id 集合 */
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const [confirm, setConfirm] = useState<{ row: CardKeyRow; action: CardKeyAction } | null>(
    null,
  );
  const [actionBusy, setActionBusy] = useState(false);

  /** 清空卡密弹窗目标（点开时先拉取该商品实时库存统计） */
  const [clearTarget, setClearTarget] = useState<{
    id: string;
    name: string;
    unused: number;
    void: number;
  } | null>(null);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearChecking, setClearChecking] = useState(false);

  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const showNotice = useCallback((okFlag: boolean, text: string) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice({ ok: okFlag, text });
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500);
  }, []);

  // 商品下拉数据
  useEffect(() => {
    void (async () => {
      try {
        const res = await adminFetch('/api/card-management/products');
        if (res.ok) setProducts((await res.json()) as CardProductRow[]);
      } catch {
        /* 下拉失败不阻塞页面，列表仍可加载 */
      }
    })();
  }, []);

  // 读取 URL 参数（概览/商品页带 ?product= 跳转过来时预选筛选）
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const p = sp.get('product')?.trim() || '';
    if (p) setFilters((f) => ({ ...f, productId: p }));
    setReady(true);
  }, []);

  const loadKeys = useCallback(async () => {
    setLoadError(null);
    try {
      const sp = new URLSearchParams();
      sp.set('page', String(page));
      sp.set('page_size', String(PAGE_SIZE));
      if (filters.productId) sp.set('card_product_id', filters.productId);
      if (filters.status) sp.set('status', filters.status);
      if (filters.orderId) sp.set('order_id', filters.orderId);
      if (filters.issuedFrom) sp.set('issued_from', filters.issuedFrom);
      if (filters.issuedTo) sp.set('issued_to', filters.issuedTo);

      const res = await adminFetch(`/api/card-management/keys?${sp.toString()}`);
      if (!res.ok) throw new Error(await extractError(res));
      setData((await res.json()) as KeysResponse);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
      setData(null);
    }
  }, [filters, page]);

  useEffect(() => {
    if (!ready) return;
    void loadKeys();
  }, [ready, loadKeys]);

  useEffect(
    () => () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  const productName = (id: string) => {
    const p = products.find((x) => x.id === id);
    return p ? productLabel(p) : '未知商品';
  };

  const applyOrderId = () => {
    setPage(1);
    setFilters((f) => ({ ...f, orderId: orderIdInput.trim() }));
  };

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    setOrderIdInput('');
    setPage(1);
  };

  const handleAction = async () => {
    if (!confirm || actionBusy) return;
    const { row, action } = confirm;
    setActionBusy(true);
    try {
      const res = await adminFetch(`/api/card-management/keys/${row.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      setConfirm(null);
      showNotice(true, `已${ACTION_LABEL[action]}`);
      await loadKeys();
    } catch (e) {
      showNotice(false, e instanceof Error ? e.message : '操作失败');
      setConfirm(null);
    } finally {
      setActionBusy(false);
    }
  };

  /** 点开「清空卡密」：先拉取该商品实时库存，仅当存在未使用/已作废卡密时弹确认框 */
  const openClear = async () => {
    if (!filters.productId || clearChecking) return;
    setClearChecking(true);
    try {
      const res = await adminFetch(
        `/api/card-management/products/${filters.productId}`,
      );
      if (!res.ok) throw new Error(await extractError(res));
      const detail = (await res.json()) as {
        stats?: { unused: number; void: number };
      };
      const unused = detail.stats?.unused ?? 0;
      const voidCount = detail.stats?.void ?? 0;
      if (unused + voidCount === 0) {
        showNotice(false, '该商品下没有可清空的卡密（仅未使用 / 已作废可删）');
        return;
      }
      setClearTarget({
        id: filters.productId,
        name: productName(filters.productId),
        unused,
        void: voidCount,
      });
    } catch (e) {
      showNotice(false, e instanceof Error ? e.message : '读取库存失败');
    } finally {
      setClearChecking(false);
    }
  };

  /** 确认清空：批量删除该商品下全部未使用/已作废卡密 */
  const handleClear = async () => {
    if (!clearTarget || clearBusy) return;
    setClearBusy(true);
    try {
      const res = await adminFetch(
        `/api/card-management/keys?card_product_id=${encodeURIComponent(clearTarget.id)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error(await extractError(res));
      const result = (await res.json()) as { deleted: number };
      setClearTarget(null);
      showNotice(true, `已删除 ${result.deleted} 张卡密`);
      if (page === 1) await loadKeys();
      else setPage(1);
    } catch (e) {
      showNotice(false, e instanceof Error ? e.message : '清空失败');
      setClearTarget(null);
    } finally {
      setClearBusy(false);
    }
  };

  const toggleReveal = (id: string) =>
    setRevealed((r) => ({ ...r, [id]: !r[id] }));

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="卡密库存"
        description="查看与管理全部卡密：默认遮罩展示，支持作废 / 恢复 / 重新发放"
        createLabel="批量导入"
        onCreate={() =>
          router.push(
            filters.productId
              ? `/admin/card-management/keys/import?product=${filters.productId}`
              : '/admin/card-management/keys/import',
          )
        }
      />

      {/* 筛选区 */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <FilterField label="卡密商品">
          <select
            className={`${selectCls} w-44`}
            value={filters.productId}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, productId: e.target.value }));
            }}
          >
            <option value="">全部商品</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {productLabel(p)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="状态">
          <select
            className={`${selectCls} w-32`}
            value={filters.status}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, status: e.target.value }));
            }}
          >
            <option value="">全部状态</option>
            <option value="unused">未使用</option>
            <option value="issued">已发放</option>
            <option value="void">已作废</option>
          </select>
        </FilterField>
        <FilterField label="发放从">
          <input
            type="date"
            className={`${inputCls} w-40`}
            value={filters.issuedFrom}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, issuedFrom: e.target.value }));
            }}
          />
        </FilterField>
        <FilterField label="发放至">
          <input
            type="date"
            className={`${inputCls} w-40`}
            value={filters.issuedTo}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, issuedTo: e.target.value }));
            }}
          />
        </FilterField>
        <FilterField label="订单号">
          <input
            className={`${inputCls} w-44`}
            value={orderIdInput}
            onChange={(e) => setOrderIdInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyOrderId();
              }
            }}
            placeholder="精确匹配"
          />
        </FilterField>
        <div className="flex items-center gap-2">
          <button type="button" onClick={applyOrderId} className={btnPrimary}>
            查询
          </button>
          <button type="button" onClick={handleReset} className={btnGhost}>
            重置
          </button>
          {filters.productId && (
            <button
              type="button"
              onClick={() => void openClear()}
              disabled={clearChecking}
              className={btnDangerGhost}
              title="永久删除该商品下全部未使用 / 已作废卡密（已发放不受影响）"
            >
              {clearChecking ? '读取库存…' : '清空卡密'}
            </button>
          )}
        </div>
      </div>

      {loadError ? (
        <div className="rounded-card border border-apple-border bg-apple-card p-6 text-center shadow-card">
          <p className="text-[14px] leading-relaxed text-apple-text-2">{loadError}</p>
          <button type="button" onClick={() => void loadKeys()} className={`${btnGhost} mt-4`}>
            重试
          </button>
        </div>
      ) : (
        <>
          <TableShell>
            <thead>
              <tr>
                <th className={thCls}>卡密内容</th>
                <th className={thCls}>状态</th>
                <th className={thCls}>所属商品</th>
                <th className={thCls}>订单号</th>
                <th className={thCls}>发放时间</th>
                <th className={thCls}>导入时间</th>
                <th className={thCls}>操作</th>
              </tr>
            </thead>
            <tbody>
              {data === null ? (
                <LoadingRows colSpan={7} />
              ) : items.length === 0 ? (
                <EmptyRow
                  colSpan={7}
                  text={
                    data.total > 0 || page > 1
                      ? '当前筛选条件下没有卡密'
                      : '还没有卡密，请先批量导入'
                  }
                  createLabel={page > 1 ? undefined : '批量导入'}
                  onCreate={
                    page > 1
                      ? undefined
                      : () => router.push('/admin/card-management/keys/import')
                  }
                />
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="transition hover:bg-apple-bg/60">
                    <td className={tdCls}>
                      <div className="flex items-center gap-1.5">
                        <code className="whitespace-nowrap font-mono text-[13px] text-apple-text">
                          {revealed[row.id] ? row.content : maskTail(row.content)}
                        </code>
                        <button
                          type="button"
                          onClick={() => toggleReveal(row.id)}
                          aria-label={revealed[row.id] ? '隐藏卡密内容' : '显示卡密内容'}
                          title={revealed[row.id] ? '隐藏' : '显示'}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-apple-text-3 transition hover:bg-apple-bg hover:text-apple-text"
                        >
                          {revealed[row.id] ? (
                            <EyeOff className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                        {revealed[row.id] && <CopyButton text={row.content} />}
                      </div>
                    </td>
                    <td className={tdCls}>
                      <Badge tone={STATUS_TONE[row.status]}>
                        {CARD_KEY_STATUS_LABEL[row.status]}
                      </Badge>
                    </td>
                    <td className={tdCls}>
                      <span className="block max-w-[180px] truncate" title={productName(row.card_product_id)}>
                        {productName(row.card_product_id)}
                      </span>
                    </td>
                    <td className={`${tdCls} max-w-[160px] truncate text-apple-text-2`}>
                      {row.order_id ?? '—'}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap text-apple-text-2`}>
                      {formatDateTime(row.issued_at)}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap text-apple-text-2`}>
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-4 whitespace-nowrap">
                        {ACTIONS_BY_STATUS[row.status].map((action) => (
                          <button
                            key={action}
                            type="button"
                            onClick={() => setConfirm({ row, action })}
                            className={`text-[13px] font-medium transition hover:opacity-80 ${
                              action === 'void'
                                ? 'text-[#D70015]'
                                : 'text-apple-blue hover:text-apple-blue-hover'
                            }`}
                          >
                            {ACTION_LABEL[action]}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>

          {data && (
            <Pagination
              page={data.page}
              pageSize={data.page_size}
              total={data.total}
              onChange={(p) => setPage(p)}
            />
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm ? ACTION_CONFIRM[confirm.action].title : ''}
        message={
          confirm
            ? `确定要对卡密「${maskTail(confirm.row.content)}」执行「${
                ACTION_LABEL[confirm.action]
              }」吗？`
            : ''
        }
        note={confirm ? ACTION_CONFIRM[confirm.action].note : undefined}
        confirmText={confirm ? ACTION_LABEL[confirm.action] : '确定'}
        busy={actionBusy}
        onConfirm={handleAction}
        onClose={() => {
          if (!actionBusy) setConfirm(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(clearTarget)}
        title="清空卡密"
        message={
          clearTarget
            ? `确定要清空商品「${clearTarget.name}」下全部 ${
                clearTarget.unused + clearTarget.void
              } 张可删卡密吗？`
            : ''
        }
        note={
          clearTarget
            ? `将永久删除：未使用 ${clearTarget.unused} 张 + 已作废 ${clearTarget.void} 张；已发放的卡密不受影响。删除后不可恢复。`
            : undefined
        }
        confirmText="清空"
        busy={clearBusy}
        onConfirm={handleClear}
        onClose={() => {
          if (!clearBusy) setClearTarget(null);
        }}
      />

      <Notice notice={notice} />
    </>
  );
}

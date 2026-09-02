'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import { formatDateTime, maskTail } from '@/lib/format';
import {
  CARD_DELIVERY_STATUS_LABEL,
  type CardDeliveryStatus,
} from '@/lib/card-types';
import CopyButton from '../CopyButton';
import Modal from '../Modal';
import ConfirmDialog from '../ConfirmDialog';
import {
  PageHeader,
  TableShell,
  LoadingRows,
  EmptyRow,
  Notice,
  Pagination,
  Badge,
  Field,
  inputCls,
  selectCls,
  btnPrimary,
  btnGhost,
  thCls,
  tdCls,
  type BadgeTone,
} from '../ui';
import { productLabel, type CardDeliveryRow, type CardProductRow } from './shared';

/** GET /api/card-management/deliveries 响应 */
interface DeliveriesResponse {
  items: CardDeliveryRow[];
  total: number;
  page: number;
  page_size: number;
}

/** POST /api/card-management/deliveries 响应（附当前剩余库存） */
type CreatedDelivery = CardDeliveryRow & { available: number };

interface Filters {
  productId: string;
  status: string;
  orderId: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { productId: '', status: '', orderId: '', from: '', to: '' };

const PAGE_SIZE = 20;

const STATUS_TONE: Record<CardDeliveryStatus, BadgeTone> = {
  pending: 'amber',
  fulfilled: 'green',
  cancelled: 'gray',
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
 * 发货记录（取卡登记）：
 * - 登记：核实买家付款后录入订单号 + 商品 + 数量，系统生成取卡码
 * - 列表筛选：订单号 / 商品 / 状态 / 登记时间范围（服务端分页）
 * - 取卡码默认遮罩，点击明文并可复制；待取卡的登记可取消
 */
export default function CardDeliveriesManager() {
  const [products, setProducts] = useState<CardProductRow[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [orderIdInput, setOrderIdInput] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DeliveriesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 登记弹窗
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ order_id: '', card_product_id: '', quantity: '1' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedDelivery | null>(null);

  // 取消确认
  const [cancelling, setCancelling] = useState<CardDeliveryRow | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  /** 已明文展示的取卡码 id 集合 */
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

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
        /* 下拉失败不阻塞页面 */
      }
    })();
  }, []);

  const loadDeliveries = useCallback(async () => {
    setLoadError(null);
    try {
      const sp = new URLSearchParams();
      sp.set('page', String(page));
      sp.set('page_size', String(PAGE_SIZE));
      if (filters.productId) sp.set('card_product_id', filters.productId);
      if (filters.status) sp.set('status', filters.status);
      if (filters.orderId) sp.set('order_id', filters.orderId);
      if (filters.from) sp.set('from', filters.from);
      if (filters.to) sp.set('to', filters.to);

      const res = await adminFetch(`/api/card-management/deliveries?${sp.toString()}`);
      if (!res.ok) throw new Error(await extractError(res));
      setData((await res.json()) as DeliveriesResponse);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
      setData(null);
    }
  }, [filters, page]);

  useEffect(() => {
    void loadDeliveries();
  }, [loadDeliveries]);

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

  /* ---------------- 登记弹窗 ---------------- */

  const openCreate = () => {
    setForm({ order_id: '', card_product_id: '', quantity: '1' });
    setFormError(null);
    setCreated(null);
    setModalOpen(true);
  };

  const closeCreate = () => {
    if (saving) return;
    setModalOpen(false);
    setCreated(null);
    // 登记成功后关闭弹窗时刷新列表
    if (created) void loadDeliveries();
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const orderId = form.order_id.trim();
    if (!orderId) return setFormError('请填写订单号');
    if (orderId.length > 100) return setFormError('订单号长度不能超过 100');
    if (!form.card_product_id) return setFormError('请选择卡密商品');
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return setFormError('数量必须为 1–100 的整数');
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await adminFetch('/api/card-management/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          card_product_id: form.card_product_id,
          quantity,
        }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      setCreated((await res.json()) as CreatedDelivery);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '登记失败');
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- 取消登记 ---------------- */

  const handleCancel = async () => {
    if (!cancelling || cancelBusy) return;
    setCancelBusy(true);
    try {
      const res = await adminFetch(
        `/api/card-management/deliveries/${cancelling.id}/cancel`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error(await extractError(res));
      setCancelling(null);
      showNotice(true, '已取消登记');
      await loadDeliveries();
    } catch (e) {
      showNotice(false, e instanceof Error ? e.message : '取消失败');
      setCancelling(null);
    } finally {
      setCancelBusy(false);
    }
  };

  const toggleReveal = (id: string) => setRevealed((r) => ({ ...r, [id]: !r[id] }));

  const items = data?.items ?? [];
  /** 登记弹窗内可选商品：仅启用中的（后端同样会拦截禁用商品） */
  const enabledProducts = products.filter((p) => p.enabled);

  return (
    <>
      <PageHeader
        title="发货记录"
        description="核实买家付款后登记取卡单，系统生成取卡码；买家凭订单号 + 取卡码自助取卡"
        createLabel="登记取卡"
        onCreate={openCreate}
      />

      {/* 筛选区 */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
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
            <option value="pending">待取卡</option>
            <option value="fulfilled">已发放</option>
            <option value="cancelled">已取消</option>
          </select>
        </FilterField>
        <FilterField label="登记从">
          <input
            type="date"
            className={`${inputCls} w-40`}
            value={filters.from}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, from: e.target.value }));
            }}
          />
        </FilterField>
        <FilterField label="登记至">
          <input
            type="date"
            className={`${inputCls} w-40`}
            value={filters.to}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, to: e.target.value }));
            }}
          />
        </FilterField>
        <div className="flex items-center gap-2">
          <button type="button" onClick={applyOrderId} className={btnPrimary}>
            查询
          </button>
          <button type="button" onClick={handleReset} className={btnGhost}>
            重置
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-card border border-apple-border bg-apple-card p-6 text-center shadow-card">
          <p className="text-[14px] leading-relaxed text-apple-text-2">{loadError}</p>
          <button
            type="button"
            onClick={() => void loadDeliveries()}
            className={`${btnGhost} mt-4`}
          >
            重试
          </button>
        </div>
      ) : (
        <>
          <TableShell>
            <thead>
              <tr>
                <th className={thCls}>订单号</th>
                <th className={thCls}>商品</th>
                <th className={thCls}>数量</th>
                <th className={thCls}>取卡码</th>
                <th className={thCls}>状态</th>
                <th className={thCls}>登记时间</th>
                <th className={thCls}>发放时间</th>
                <th className={thCls}>操作</th>
              </tr>
            </thead>
            <tbody>
              {data === null ? (
                <LoadingRows colSpan={8} />
              ) : items.length === 0 ? (
                <EmptyRow
                  colSpan={8}
                  text={
                    data.total > 0 || page > 1
                      ? '当前筛选条件下没有发货记录'
                      : '还没有发货记录，核实买家付款后点击「登记取卡」'
                  }
                  createLabel={page > 1 ? undefined : '登记取卡'}
                  onCreate={page > 1 ? undefined : openCreate}
                />
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="transition hover:bg-apple-bg/60">
                    <td className={`${tdCls} font-medium`}>{row.order_id}</td>
                    <td className={tdCls}>
                      <span className="block max-w-[180px] truncate" title={productName(row.card_product_id)}>
                        {productName(row.card_product_id)}
                      </span>
                    </td>
                    <td className={`${tdCls} tabular-nums`}>{row.quantity}</td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-1.5">
                        <code className="whitespace-nowrap font-mono text-[13px] text-apple-text">
                          {revealed[row.id] ? row.claim_token : maskTail(row.claim_token)}
                        </code>
                        <button
                          type="button"
                          onClick={() => toggleReveal(row.id)}
                          aria-label={revealed[row.id] ? '隐藏取卡码' : '显示取卡码'}
                          title={revealed[row.id] ? '隐藏' : '显示'}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-apple-text-3 transition hover:bg-apple-bg hover:text-apple-text"
                        >
                          {revealed[row.id] ? (
                            <EyeOff className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                        {revealed[row.id] && (
                          <CopyButton
                            text={`${row.order_id}\n${row.claim_token}`}
                            label="复制"
                          />
                        )}
                      </div>
                    </td>
                    <td className={tdCls}>
                      <Badge tone={STATUS_TONE[row.status]}>
                        {CARD_DELIVERY_STATUS_LABEL[row.status]}
                      </Badge>
                    </td>
                    <td className={`${tdCls} whitespace-nowrap text-apple-text-2`}>
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap text-apple-text-2`}>
                      {formatDateTime(row.fulfilled_at)}
                    </td>
                    <td className={tdCls}>
                      {row.status === 'pending' ? (
                        <button
                          type="button"
                          onClick={() => setCancelling(row)}
                          className="text-[13px] font-medium text-[#D70015] transition hover:opacity-80"
                        >
                          取消
                        </button>
                      ) : (
                        <span className="text-apple-text-3">—</span>
                      )}
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

      {/* 登记弹窗：表单 / 登记成功两个视图 */}
      <Modal
        open={modalOpen}
        title={created ? '登记成功' : '登记取卡'}
        onClose={closeCreate}
        footer={
          created ? (
            <button type="button" className={btnPrimary} onClick={closeCreate}>
              完成
            </button>
          ) : (
            <>
              <button type="button" className={btnGhost} onClick={closeCreate} disabled={saving}>
                取消
              </button>
              <button
                type="submit"
                form="delivery-form"
                className={btnPrimary}
                disabled={saving}
              >
                {saving ? '登记中…' : '登记并生成取卡码'}
              </button>
            </>
          )
        }
      >
        {created ? (
          <div className="space-y-4">
            <p className="text-[14px] leading-relaxed text-apple-text">
              已为订单 <span className="font-semibold">{created.order_id}</span> 登记{' '}
              {created.quantity} 张卡密。
            </p>
            <div className="rounded-lg border border-apple-hairline bg-apple-bg/50 p-4">
              <p className="text-[12px] text-apple-text-3">取卡码</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="break-all font-mono text-[13px] text-apple-text">
                  {created.claim_token}
                </code>
                <CopyButton
                  text={`${created.order_id}\n${created.claim_token}`}
                  label="复制订单号 + 取卡码"
                />
              </div>
            </div>
            <p className="rounded-lg bg-[#FFF4E0] px-3 py-2.5 text-[13px] leading-relaxed text-[#8A6100]">
              请将「订单号 + 取卡码」一并发送给买家，两者缺一不可取卡。
              {`该商品当前剩余库存 ${created.available} 条${
                created.available < created.quantity ? '，库存不足，买家取卡前请先补货' : ''
              }。`}
            </p>
          </div>
        ) : (
          <form id="delivery-form" onSubmit={handleCreate} className="space-y-4">
            <Field label="订单号" required hint="支付平台的订单号，全局唯一（幂等键）">
              <input
                className={inputCls}
                value={form.order_id}
                onChange={(e) => setForm((f) => ({ ...f, order_id: e.target.value }))}
                placeholder="如：20260824123456"
                maxLength={100}
                disabled={saving}
              />
            </Field>
            <Field
              label="卡密商品"
              required
              hint={
                enabledProducts.length === 0
                  ? '暂无可选商品：请先创建并启用卡密商品'
                  : undefined
              }
            >
              <select
                className={selectCls}
                value={form.card_product_id}
                onChange={(e) => setForm((f) => ({ ...f, card_product_id: e.target.value }))}
                disabled={saving}
              >
                <option value="">请选择…</option>
                {enabledProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {productLabel(p)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="数量" required hint="1–100 的整数；库存不足也可先登记，补货后买家再取卡">
              <input
                className={inputCls}
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                type="number"
                min={1}
                max={100}
                step={1}
                inputMode="numeric"
                disabled={saving}
              />
            </Field>
            {formError && (
              <p className="text-[13px] text-[#D70015]" role="alert">
                {formError}
              </p>
            )}
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelling)}
        title="取消取卡登记"
        message={
          cancelling
            ? `确定要取消订单「${cancelling.order_id}」的取卡登记吗？`
            : ''
        }
        note="取消后取卡码立即失效，买家无法再取卡；此操作不可撤销。"
        confirmText="取消登记"
        busy={cancelBusy}
        onConfirm={handleCancel}
        onClose={() => {
          if (!cancelBusy) setCancelling(null);
        }}
      />

      <Notice notice={notice} />
    </>
  );
}

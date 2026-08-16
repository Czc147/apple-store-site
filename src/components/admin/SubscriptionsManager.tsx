'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { Subscription } from '@/lib/types';
import { formatPrice, toNumber } from '@/lib/format';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import {
  Field,
  PageHeader,
  TableShell,
  LinkCell,
  LoadingRows,
  EmptyRow,
  RowActions,
  Notice,
  inputCls,
  btnPrimary,
  btnGhost,
  thCls,
  tdCls,
} from './ui';

interface FormState {
  name: string;
  price: string;
  duration: string;
  payment_url: string;
  sort_order: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  price: '0',
  duration: '',
  payment_url: '',
  sort_order: '0',
};

/** 订阅管理：名称 + 价格 + 时长徽章文案 + 付款链接 */
export default function SubscriptionsManager() {
  const [rows, setRows] = useState<Subscription[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<Subscription | null>(null);
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
      const res = await adminFetch('/api/subscriptions');
      if (!res.ok) throw new Error(await extractError(res));
      setRows(((await res.json()) as Subscription[]).map((s) => ({
        ...s,
        price: toNumber(s.price),
      })));
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

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (row: Subscription) => {
    setEditing(row);
    setForm({
      name: row.name,
      price: String(row.price),
      duration: row.duration ?? '',
      payment_url: row.payment_url ?? '',
      sort_order: String(row.sort_order),
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const name = form.name.trim();
    if (!name) return setFormError('请填写订阅名称');
    const price = Math.round(toNumber(form.price) * 100) / 100;
    if (!Number.isFinite(price) || price < 0) return setFormError('价格必须是有效数字');
    const sortOrder = Number(form.sort_order);
    if (!Number.isFinite(sortOrder)) return setFormError('排序必须是数字');

    setSaving(true);
    setFormError(null);
    try {
      const res = await adminFetch(
        editing ? `/api/subscriptions/${editing.id}` : '/api/subscriptions',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            price,
            duration: form.duration.trim() || null,
            payment_url: form.payment_url.trim() || null,
            sort_order: sortOrder,
          }),
        },
      );
      if (!res.ok) throw new Error(await extractError(res));
      setModalOpen(false);
      showNotice(true, editing ? '已保存修改' : '已新增订阅');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await adminFetch(`/api/subscriptions/${deleting.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await extractError(res));
      setDeleting(null);
      showNotice(true, '已删除');
      await load();
    } catch (err) {
      showNotice(false, err instanceof Error ? err.message : '删除失败');
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="订阅管理"
        description="管理「订阅」页的套餐卡片，前台按排序值升序展示"
        createLabel="新增订阅"
        onCreate={openCreate}
      />

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
              <th className={thCls}>名称</th>
              <th className={thCls}>价格</th>
              <th className={thCls}>时长</th>
              <th className={thCls}>付款链接</th>
              <th className={thCls}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <LoadingRows colSpan={6} />
            ) : rows.length === 0 ? (
              <EmptyRow
                colSpan={6}
                text="还没有订阅套餐，新增后前台订阅页即可展示"
                createLabel="新增订阅"
                onCreate={openCreate}
              />
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-apple-bg/60">
                  <td className={tdCls}>{row.sort_order}</td>
                  <td className={`${tdCls} font-medium`}>{row.name}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    {formatPrice(row.price)}
                  </td>
                  <td className={tdCls}>
                    {row.duration ? (
                      <span className="rounded-full bg-apple-blue-soft px-2.5 py-1 text-[12px] font-medium text-apple-blue">
                        {row.duration}
                      </span>
                    ) : (
                      <span className="text-apple-text-3">—</span>
                    )}
                  </td>
                  <td className={tdCls}>
                    <LinkCell href={row.payment_url} />
                  </td>
                  <td className={tdCls}>
                    <RowActions
                      onEdit={() => openEdit(row)}
                      onDelete={() => setDeleting(row)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      )}

      <Modal
        open={modalOpen}
        title={editing ? '编辑订阅' : '新增订阅'}
        onClose={() => {
          if (!saving) setModalOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className={btnGhost}
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="submit"
              form="subscription-form"
              className={btnPrimary}
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        <form id="subscription-form" onSubmit={handleSave} className="space-y-4">
          <Field label="订阅名称" required>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="如：年度订阅"
              maxLength={60}
            />
          </Field>
          <Field label="价格" required hint="单位：元，保留两位小数">
            <input
              className={inputCls}
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
            />
          </Field>
          <Field label="订阅时长" hint="展示为徽章文案，如「月付」「季付」「年付」，选填">
            <input
              className={inputCls}
              value={form.duration}
              onChange={(e) =>
                setForm((f) => ({ ...f, duration: e.target.value }))
              }
              placeholder="月付"
              maxLength={20}
            />
          </Field>
          <Field label="付款链接" hint="填写酷发卡（kufaka.com）的商品链接，选填">
            <input
              className={inputCls}
              value={form.payment_url}
              onChange={(e) =>
                setForm((f) => ({ ...f, payment_url: e.target.value }))
              }
              placeholder="https://kufaka.com/…"
              inputMode="url"
            />
          </Field>
          <Field label="排序" hint="数字越小越靠前">
            <input
              className={inputCls}
              value={form.sort_order}
              onChange={(e) =>
                setForm((f) => ({ ...f, sort_order: e.target.value }))
              }
              type="number"
              step={1}
              inputMode="numeric"
            />
          </Field>
          {formError && (
            <p className="text-[13px] text-[#D70015]" role="alert">
              {formError}
            </p>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="删除订阅"
        message={
          deleting ? `确定要删除「${deleting.name}」吗？此操作不可恢复。` : ''
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

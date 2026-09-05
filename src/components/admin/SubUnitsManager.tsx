'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { MajorUnit, SubUnit } from '@/lib/types';
import { formatPrice, toNumber } from '@/lib/format';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import FileUploader from './FileUploader';
import {
  Field,
  PageHeader,
  TableShell,
  Thumb,
  LinkCell,
  LoadingRows,
  EmptyRow,
  RowActions,
  Notice,
  inputCls,
  selectCls,
  btnPrimary,
  btnGhost,
  thCls,
  tdCls,
} from './ui';

interface FormState {
  major_unit_id: string;
  name: string;
  sort_order: string;
  price: string;
  payment_url: string;
  redeem_image_url: string;
}

const EMPTY_FORM: FormState = {
  major_unit_id: '',
  name: '',
  sort_order: '0',
  price: '0',
  payment_url: '',
  redeem_image_url: '',
};

/** 小单元管理：支持按大单元筛选；删除前二次确认 */
export default function SubUnitsManager() {
  const [rows, setRows] = useState<SubUnit[] | null>(null);
  const [majors, setMajors] = useState<MajorUnit[]>([]);
  const [filterMajor, setFilterMajor] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SubUnit | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<SubUnit | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [batchOpen, setBatchOpen] = useState(false);
  const [batch, setBatch] = useState({
    major_unit_id: '',
    prefix: '',
    start: '1',
    end: '1',
    pad: '0',
  });
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<{
    created: number;
    skipped: number;
    errors: number;
  } | null>(null);

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
      const [subsRes, majorsRes] = await Promise.all([
        adminFetch('/api/sub-units'),
        adminFetch('/api/major-units'),
      ]);
      if (!subsRes.ok) throw new Error(await extractError(subsRes));
      if (!majorsRes.ok) throw new Error(await extractError(majorsRes));
      setRows(((await subsRes.json()) as SubUnit[]).map((s) => ({
        ...s,
        price: toNumber(s.price),
      })));
      setMajors((await majorsRes.json()) as MajorUnit[]);
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

  const majorName = (id: string) =>
    majors.find((m) => m.id === id)?.name ?? '未知';

  const visible =
    rows === null
      ? null
      : rows.filter((r) => !filterMajor || r.major_unit_id === filterMajor);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, major_unit_id: majors[0]?.id ?? '' });
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (row: SubUnit) => {
    setEditing(row);
    setForm({
      major_unit_id: row.major_unit_id,
      name: row.name,
      sort_order: String(row.sort_order),
      price: String(row.price),
      payment_url: row.payment_url ?? '',
      redeem_image_url: row.redeem_image_url ?? '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const name = form.name.trim();
    if (!name) return setFormError('请填写名称');
    if (!form.major_unit_id) return setFormError('请选择所属大单元');
    const price = Math.round(toNumber(form.price) * 100) / 100;
    if (!Number.isFinite(price) || price < 0) return setFormError('价格必须是有效数字');
    const sortOrder = Number(form.sort_order);
    if (!Number.isFinite(sortOrder)) return setFormError('排序必须是数字');

    setSaving(true);
    setFormError(null);
    try {
      const res = await adminFetch(
        editing ? `/api/sub-units/${editing.id}` : '/api/sub-units',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            major_unit_id: form.major_unit_id,
            name,
            sort_order: sortOrder,
            price,
            payment_url: form.payment_url.trim() || null,
            redeem_image_url: form.redeem_image_url.trim() || null,
          }),
        },
      );
      if (!res.ok) throw new Error(await extractError(res));
      setModalOpen(false);
      showNotice(true, editing ? '已保存修改' : '已新增小单元');
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
      const res = await adminFetch(`/api/sub-units/${deleting.id}`, {
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

  const existingNames = useMemo(
    () =>
      new Set(
        (rows ?? [])
          .filter((r) => r.major_unit_id === batch.major_unit_id)
          .map((r) => r.name),
      ),
    [rows, batch.major_unit_id],
  );

  const maxSort = useMemo(
    () =>
      Math.max(
        0,
        ...(rows ?? [])
          .filter((r) => r.major_unit_id === batch.major_unit_id)
          .map((r) => Number(r.sort_order) || 0),
      ),
    [rows, batch.major_unit_id],
  );

  const batchNames = useMemo(() => {
    const start = Math.floor(Number(batch.start));
    const end = Math.floor(Number(batch.end));
    const pad = Math.floor(Number(batch.pad));
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start > end ||
      end - start + 1 > 500
    ) {
      return [];
    }
    const out: string[] = [];
    for (let n = start; n <= end; n++) {
      const numStr = pad > 0 ? String(n).padStart(pad, '0') : String(n);
      out.push(`${batch.prefix}${numStr}`);
    }
    return out;
  }, [batch]);

  const openBatch = () => {
    setBatch({
      major_unit_id: filterMajor || majors[0]?.id || '',
      prefix: '',
      start: '1',
      end: '1',
      pad: '0',
    });
    setBatchError(null);
    setBatchResult(null);
    setBatchOpen(true);
  };

  const handleBatch = async () => {
    if (batchBusy) return;
    if (!batch.major_unit_id) return setBatchError('请选择大单元');
    const start = Math.floor(Number(batch.start));
    const end = Math.floor(Number(batch.end));
    const pad = Math.floor(Number(batch.pad));
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return setBatchError('起始 / 结束必须是整数');
    }
    if (start > end) return setBatchError('起始数字不能大于结束数字');
    const count = end - start + 1;
    if (count > 500) return setBatchError(`单次最多创建 500 个（当前 ${count} 个）`);
    if (pad < 0 || pad > 20) return setBatchError('补零宽度需在 0–20 之间');

    setBatchBusy(true);
    setBatchError(null);
    setBatchResult(null);
    let created = 0;
    let skipped = 0;
    let errors = 0;
    let sort = maxSort;
    const existing = new Set(existingNames);
    for (let n = start; n <= end; n++) {
      const numStr = pad > 0 ? String(n).padStart(pad, '0') : String(n);
      const name = `${batch.prefix}${numStr}`;
      if (existing.has(name)) {
        skipped += 1;
        continue;
      }
      const nextSort = sort + 1;
      try {
        const res = await adminFetch('/api/sub-units', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            major_unit_id: batch.major_unit_id,
            name,
            sort_order: nextSort,
            price: 0,
          }),
        });
        if (res.ok) {
          created += 1;
          existing.add(name);
          sort = nextSort;
        } else {
          const msg = await extractError(res);
          if (/已存在|duplicate|unique|23505/i.test(msg)) skipped += 1;
          else errors += 1;
        }
      } catch {
        errors += 1;
      }
    }
    setBatchResult({ created, skipped, errors });
    setBatchBusy(false);
    showNotice(true, `批量创建完成：新增 ${created}，跳过 ${skipped}`);
    await load();
  };

  return (
    <>
      <PageHeader
        title="小单元管理"
        description="管理挂在各大单元下的具体商品，付款链接指向酷发卡商品页"
        createLabel="新增小单元"
        onCreate={openCreate}
      />

      {/* 按大单元筛选 + 批量创建入口 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <label htmlFor="filter-major" className="shrink-0 text-[13px] text-apple-text-2">
            按大单元筛选
          </label>
          <select
            id="filter-major"
            className={`${selectCls} w-44`}
            value={filterMajor}
            onChange={(e) => setFilterMajor(e.target.value)}
          >
            <option value="">全部</option>
            {majors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className={btnGhost} onClick={openBatch}>
          批量创建
        </button>
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
              <th className={thCls}>名称</th>
              <th className={thCls}>所属大单元</th>
              <th className={thCls}>价格</th>
              <th className={thCls}>付款链接</th>
              <th className={thCls}>兑换商品</th>
              <th className={thCls}>操作</th>
            </tr>
          </thead>
          <tbody>
            {visible === null ? (
              <LoadingRows colSpan={7} />
            ) : visible.length === 0 ? (
              <EmptyRow
                colSpan={7}
                text={rows?.length ? '当前筛选条件下没有小单元' : '还没有小单元，新增后前台即可选购'}
                createLabel="新增小单元"
                onCreate={openCreate}
              />
            ) : (
              visible.map((row) => (
                <tr key={row.id} className="transition hover:bg-apple-bg/60">
                  <td className={tdCls}>{row.sort_order}</td>
                  <td className={`${tdCls} font-medium`}>{row.name}</td>
                  <td className={tdCls}>
                    <span className="rounded-full bg-apple-bg px-2.5 py-1 text-[12px] text-apple-text-2">
                      {majorName(row.major_unit_id)}
                    </span>
                  </td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    {formatPrice(row.price)}
                  </td>
                  <td className={tdCls}>
                    <LinkCell href={row.payment_url} />
                  </td>
                  <td className={tdCls}>
                    <Thumb src={row.redeem_image_url} alt={`${row.name} 兑换商品`} />
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
        title={editing ? '编辑小单元' : '新增小单元'}
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
              form="sub-unit-form"
              className={btnPrimary}
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        <form id="sub-unit-form" onSubmit={handleSave} className="space-y-4">
          <Field label="名称" required>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="如：进阶版"
              maxLength={80}
            />
          </Field>
          <Field
            label="所属大单元"
            required
            hint={
              majors.length === 0
                ? '暂无可选大单元，请先在「大单元管理」中创建'
                : undefined
            }
          >
            <select
              className={selectCls}
              value={form.major_unit_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, major_unit_id: e.target.value }))
              }
            >
              <option value="">请选择…</option>
              {majors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
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
          <Field
            label="兑换商品"
            hint="不公开；买家在「兑换」页输入卡密成功后弹出该内容（图片 / 视频 / 文档）"
          >
            <FileUploader
              value={form.redeem_image_url || null}
              onChange={(url) =>
                setForm((f) => ({ ...f, redeem_image_url: url ?? '' }))
              }
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

      <Modal
        open={batchOpen}
        title="批量创建小单元"
        onClose={() => {
          if (!batchBusy) setBatchOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className={btnGhost}
              onClick={() => setBatchOpen(false)}
              disabled={batchBusy}
            >
              取消
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => void handleBatch()}
              disabled={batchBusy || batchNames.length === 0}
            >
              {batchBusy ? '创建中…' : `创建 ${batchNames.length} 个`}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="所属大单元" required>
            <select
              className={selectCls}
              value={batch.major_unit_id}
              onChange={(e) =>
                setBatch((b) => ({ ...b, major_unit_id: e.target.value }))
              }
              disabled={batchBusy}
            >
              <option value="">请选择…</option>
              {majors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="名称前缀" hint="如「进阶版」「商品」">
            <input
              className={inputCls}
              value={batch.prefix}
              onChange={(e) => setBatch((b) => ({ ...b, prefix: e.target.value }))}
              placeholder="如：进阶版"
              disabled={batchBusy}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="起始数字" required>
              <input
                className={inputCls}
                type="number"
                value={batch.start}
                onChange={(e) => setBatch((b) => ({ ...b, start: e.target.value }))}
                disabled={batchBusy}
              />
            </Field>
            <Field label="结束数字" required>
              <input
                className={inputCls}
                type="number"
                value={batch.end}
                onChange={(e) => setBatch((b) => ({ ...b, end: e.target.value }))}
                disabled={batchBusy}
              />
            </Field>
          </div>
          <Field label="补零宽度" hint="0 = 不补零；如填 3，则 1 → 001">
            <input
              className={inputCls}
              type="number"
              min={0}
              max={20}
              value={batch.pad}
              onChange={(e) => setBatch((b) => ({ ...b, pad: e.target.value }))}
              disabled={batchBusy}
            />
          </Field>

          {batchNames.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[12px] text-apple-text-2">
                预览（{batchNames.length} 个，其中{' '}
                {batchNames.filter((n) => existingNames.has(n)).length} 个已存在将跳过）
              </p>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-apple-hairline bg-apple-bg/40 px-3 py-2">
                {batchNames.map((n) => {
                  const exists = existingNames.has(n);
                  return (
                    <div
                      key={n}
                      className={`text-[13px] leading-relaxed ${
                        exists ? 'text-apple-text-3 line-through' : 'text-apple-text'
                      }`}
                    >
                      {n}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-[12.5px] text-apple-text-3">
              填写起始 / 结束数字后预览名单（单次最多 500 个）
            </p>
          )}

          {batchResult && (
            <p className="rounded-lg bg-[#E8F5E9] px-3 py-2 text-[13px] text-[#1B7F3B]">
              完成：新增 {batchResult.created}，跳过 {batchResult.skipped}，失败{' '}
              {batchResult.errors}
            </p>
          )}
          {batchError && (
            <p className="text-[13px] text-[#D70015]" role="alert">
              {batchError}
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="删除小单元"
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

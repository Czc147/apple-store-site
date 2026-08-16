'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { MajorUnit } from '@/lib/types';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import ImageUploader from './ImageUploader';
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
  btnPrimary,
  btnGhost,
  thCls,
  tdCls,
} from './ui';

interface FormState {
  name: string;
  image_url: string;
  link_url: string;
  sort_order: string;
}

const EMPTY_FORM: FormState = { name: '', image_url: '', link_url: '', sort_order: '0' };

/** 大单元管理：表格 + 新增/编辑弹窗 + 级联删除确认 */
export default function MajorUnitsManager() {
  const [rows, setRows] = useState<MajorUnit[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MajorUnit | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<MajorUnit | null>(null);
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
      const res = await adminFetch('/api/major-units');
      if (!res.ok) throw new Error(await extractError(res));
      setRows((await res.json()) as MajorUnit[]);
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

  const openEdit = (row: MajorUnit) => {
    setEditing(row);
    setForm({
      name: row.name,
      image_url: row.image_url ?? '',
      link_url: row.link_url ?? '',
      sort_order: String(row.sort_order),
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const name = form.name.trim();
    if (!name) return setFormError('请填写单元名称');
    const sortOrder = Number(form.sort_order);
    if (!Number.isFinite(sortOrder)) return setFormError('排序必须是数字');

    setSaving(true);
    setFormError(null);
    try {
      const res = await adminFetch(
        editing ? `/api/major-units/${editing.id}` : '/api/major-units',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            image_url: form.image_url || null,
            link_url: form.link_url.trim() || null,
            sort_order: sortOrder,
          }),
        },
      );
      if (!res.ok) throw new Error(await extractError(res));
      setModalOpen(false);
      showNotice(true, editing ? '已保存修改' : '已新增大单元');
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
      const res = await adminFetch(`/api/major-units/${deleting.id}`, {
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
        title="大单元管理"
        description="管理选购页的商品分组卡片，前台按排序值升序展示"
        createLabel="新增大单元"
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
              <th className={thCls}>展示图片</th>
              <th className={thCls}>跳转链接</th>
              <th className={thCls}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <LoadingRows colSpan={5} />
            ) : rows.length === 0 ? (
              <EmptyRow
                colSpan={5}
                text="还没有大单元，新增后前台选购页即可展示"
                createLabel="新增大单元"
                onCreate={openCreate}
              />
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-apple-bg/60">
                  <td className={tdCls}>{row.sort_order}</td>
                  <td className={`${tdCls} font-medium`}>{row.name}</td>
                  <td className={tdCls}>
                    <Thumb src={row.image_url} alt={row.name} />
                  </td>
                  <td className={tdCls}>
                    <LinkCell href={row.link_url} />
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
        title={editing ? '编辑大单元' : '新增大单元'}
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
              form="major-unit-form"
              className={btnPrimary}
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        <form id="major-unit-form" onSubmit={handleSave} className="space-y-4">
          <Field label="单元名称" required>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="如：基础套装"
              maxLength={60}
            />
          </Field>
          <Field label="展示图片" hint="上传至 Supabase Storage，建议横版 16:9">
            <ImageUploader
              value={form.image_url || null}
              onChange={(url) => setForm((f) => ({ ...f, image_url: url ?? '' }))}
            />
          </Field>
          <Field label="跳转链接">
            <input
              className={inputCls}
              value={form.link_url}
              onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
              placeholder="https://…（选填）"
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
        title="删除大单元"
        message={
          deleting ? `确定要删除「${deleting.name}」吗？此操作不可恢复。` : ''
        }
        note="删除大单元将同时删除其下所有小单元。"
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

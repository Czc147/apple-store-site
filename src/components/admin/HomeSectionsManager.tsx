'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { HomeSection, MajorUnit } from '@/lib/types';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import {
  Field,
  PageHeader,
  TableShell,
  LoadingRows,
  EmptyRow,
  RowActions,
  Notice,
  Badge,
  inputCls,
  selectCls,
  btnPrimary,
  btnGhost,
  thCls,
  tdCls,
} from './ui';

interface FormState {
  title: string;
  subtitle: string;
  layout: 'carousel' | 'grid';
  featured_only: boolean;
  major_unit_ids: string[];
  enabled: boolean;
  sort_order: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  subtitle: '',
  layout: 'carousel',
  featured_only: false,
  major_unit_ids: [],
  enabled: true,
  sort_order: '0',
};

const LAYOUT_LABEL: Record<HomeSection['layout'], string> = {
  carousel: '横向卡片流',
  grid: '两列网格',
};

/** 首页板块管理：标题 + 卡片流；carousel/grid、精选、启用开关、排序 */
export default function HomeSectionsManager() {
  const [rows, setRows] = useState<HomeSection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [majors, setMajors] = useState<MajorUnit[] | null>(null);
  const [majorsError, setMajorsError] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HomeSection | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<HomeSection | null>(null);
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
      const res = await adminFetch('/api/home-sections');
      if (!res.ok) throw new Error(await extractError(res));
      setRows((await res.json()) as HomeSection[]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
      setRows(null);
    }
  }, []);

  const loadMajors = useCallback(async () => {
    setMajorsError(false);
    try {
      const res = await adminFetch('/api/major-units');
      if (!res.ok) throw new Error(await extractError(res));
      setMajors((await res.json()) as MajorUnit[]);
    } catch {
      setMajors(null);
      setMajorsError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadMajors();
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, [load, loadMajors]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (row: HomeSection) => {
    setEditing(row);
    setForm({
      title: row.title,
      subtitle: row.subtitle ?? '',
      layout: row.layout,
      featured_only: row.featured_only,
      major_unit_ids: row.major_unit_ids ?? [],
      enabled: row.enabled,
      sort_order: String(row.sort_order),
    });
    setFormError(null);
    setModalOpen(true);
  };

  const toggleMajor = (id: string) => {
    setForm((f) => ({
      ...f,
      major_unit_ids: f.major_unit_ids.includes(id)
        ? f.major_unit_ids.filter((x) => x !== id)
        : [...f.major_unit_ids, id],
    }));
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const title = form.title.trim();
    if (!title) return setFormError('请填写板块标题');
    const sortOrder = Number(form.sort_order);
    if (!Number.isFinite(sortOrder)) return setFormError('排序必须是数字');

    setSaving(true);
    setFormError(null);
    try {
      const res = await adminFetch(
        editing ? `/api/home-sections/${editing.id}` : '/api/home-sections',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            subtitle: form.subtitle.trim() || null,
            layout: form.layout,
            featured_only: form.featured_only,
            major_unit_ids: form.major_unit_ids,
            enabled: form.enabled,
            sort_order: sortOrder,
          }),
        },
      );
      if (!res.ok) throw new Error(await extractError(res));
      setModalOpen(false);
      showNotice(true, editing ? '已保存修改' : '已新增板块');
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
      const res = await adminFetch(`/api/home-sections/${deleting.id}`, {
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
        title="首页板块"
        description="首页按板块组织：每个板块是一段「标题 + 卡片流」，前台按排序值升序渲染"
        createLabel="新增板块"
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
              <th className={thCls}>标题</th>
              <th className={thCls}>布局</th>
              <th className={thCls}>精选</th>
              <th className={thCls}>启用</th>
              <th className={thCls}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <LoadingRows colSpan={6} />
            ) : rows.length === 0 ? (
              <EmptyRow
                colSpan={6}
                text="还没有板块。未配置时前台回退为两列网格；新增板块后按序渲染"
                createLabel="新增板块"
                onCreate={openCreate}
              />
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-apple-bg/60">
                  <td className={tdCls}>{row.sort_order}</td>
                  <td className={`${tdCls} max-w-[220px]`}>
                    <div className="font-medium">{row.title}</div>
                    {row.subtitle && (
                      <div className="truncate text-[12px] text-apple-text-3">
                        {row.subtitle}
                      </div>
                    )}
                    {row.major_unit_ids && row.major_unit_ids.length > 0 && (
                      <div className="truncate text-[12px] text-apple-blue">
                        已选 {row.major_unit_ids.length} 个大单元
                      </div>
                    )}
                  </td>
                  <td className={tdCls}>{LAYOUT_LABEL[row.layout]}</td>
                  <td className={tdCls}>
                    {row.featured_only ? (
                      <Badge tone="blue">精选</Badge>
                    ) : (
                      <span className="text-apple-text-3">—</span>
                    )}
                  </td>
                  <td className={tdCls}>
                    {row.enabled ? (
                      <Badge tone="green">启用</Badge>
                    ) : (
                      <Badge tone="gray">停用</Badge>
                    )}
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
        title={editing ? '编辑板块' : '新增板块'}
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
              form="home-section-form"
              className={btnPrimary}
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        <form id="home-section-form" onSubmit={handleSave} className="space-y-4">
          <Field label="板块标题" required hint="如「精选」「全部商品」">
            <input
              className={inputCls}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="精选"
              maxLength={40}
            />
          </Field>
          <Field label="副标题" hint="显示在标题下方，选填">
            <input
              className={inputCls}
              value={form.subtitle}
              onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
              placeholder="本周热门"
              maxLength={60}
            />
          </Field>
          <Field label="布局">
            <select
              className={selectCls}
              value={form.layout}
              onChange={(e) =>
                setForm((f) => ({ ...f, layout: e.target.value as FormState['layout'] }))
              }
            >
              <option value="carousel">横向卡片流（滚动吸附）</option>
              <option value="grid">两列网格</option>
            </select>
          </Field>
          <Field
            label="选择大单元"
            hint="勾选要放进这个板块的大单元；不勾选则按下方「只显示精选」决定"
          >
            <div className="max-h-56 overflow-y-auto rounded-xl border border-apple-border bg-apple-bg/50 p-1.5">
              {majorsError ? (
                <p className="px-2 py-3 text-[12px] text-apple-text-3">
                  无法加载大单元列表，可先保存、稍后重试
                </p>
              ) : majors === null ? (
                <p className="px-2 py-3 text-[12px] text-apple-text-3">加载大单元中…</p>
              ) : majors.length === 0 ? (
                <p className="px-2 py-3 text-[12px] text-apple-text-3">
                  还没有大单元，请先到「大单元管理」添加
                </p>
              ) : (
                majors.map((m) => {
                  const checked = form.major_unit_ids.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-white"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMajor(m.id)}
                        className="h-4 w-4 shrink-0 accent-apple-blue"
                      />
                      <span className="truncate text-[13px] text-apple-text">{m.name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </Field>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-card border border-apple-hairline bg-apple-card p-4">
            <input
              type="checkbox"
              checked={form.featured_only}
              onChange={(e) => setForm((f) => ({ ...f, featured_only: e.target.checked }))}
              className="mt-0.5 h-4 w-4 accent-apple-blue"
            />
            <span className="text-[13px] leading-relaxed text-apple-text">
              只显示精选卡片
              <span className="block text-[12px] text-apple-text-3">
                未勾选大单元时生效：开启后仅展示「大单元管理」里勾选了精选的卡片
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-card border border-apple-hairline bg-apple-card p-4">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="mt-0.5 h-4 w-4 accent-apple-blue"
            />
            <span className="text-[13px] text-apple-text">在前台显示该板块</span>
          </label>
          <Field label="排序" hint="数字越小越靠前">
            <input
              className={inputCls}
              value={form.sort_order}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
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
        title="删除板块"
        message={deleting ? `确定要删除「${deleting.title}」吗？此操作不可恢复。` : ''}
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

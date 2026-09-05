'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { DailyPickAdminRow } from '@/lib/types';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import { classifyMedia, type MediaKind } from '@/lib/upload';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import FileUploader from './FileUploader';
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
  Badge,
  inputCls,
  textareaCls,
  btnPrimary,
  btnGhost,
  thCls,
  tdCls,
} from './ui';

interface FormState {
  pick_date: string;
  title: string;
  description: string;
  cover_url: string;
  /** 内容文件在私有桶 daily 的对象路径（入库字段） */
  media_path: string;
  /** 内容文件的签名预览链接（仅表单预览，不入库） */
  media_preview: string;
  link_url: string;
}

/** 内容文件类型徽章文案 */
const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  image: '图片',
  video: '视频',
  doc: '文档',
};

/** 本机时区今天 YYYY-MM-DD（新建表单的默认日期） */
function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const emptyForm = (): FormState => ({
  pick_date: localToday(),
  title: '',
  description: '',
  cover_url: '',
  media_path: '',
  media_preview: '',
  link_url: '',
});

/**
 * 每日推荐管理：一天一条（日期唯一），内容 = 图片/文件（私有桶）+ 可选跳转链接。
 * 封面图存公开桶做营销 teaser；内容文件存私有桶 daily，列表预览为现签链接。
 */
export default function DailyPicksManager() {
  const [rows, setRows] = useState<DailyPickAdminRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DailyPickAdminRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<DailyPickAdminRow | null>(null);
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
      const res = await adminFetch('/api/daily-picks');
      if (!res.ok) throw new Error(await extractError(res));
      setRows((await res.json()) as DailyPickAdminRow[]);
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
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (row: DailyPickAdminRow) => {
    setEditing(row);
    setForm({
      pick_date: row.pick_date,
      title: row.title,
      description: row.description ?? '',
      cover_url: row.cover_url ?? '',
      media_path: row.media_path ?? '',
      media_preview: row.media_preview_url ?? '',
      link_url: row.link_url ?? '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const title = form.title.trim();
    if (!title) return setFormError('请填写标题');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.pick_date)) {
      return setFormError('请选择更新日期');
    }
    if (!form.media_path.trim() && !form.link_url.trim()) {
      return setFormError('内容文件与跳转链接至少填一项');
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await adminFetch(
        editing ? `/api/daily-picks/${editing.id}` : '/api/daily-picks',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pick_date: form.pick_date,
            title,
            description: form.description.trim() || null,
            cover_url: form.cover_url.trim() || null,
            media_path: form.media_path.trim() || null,
            link_url: form.link_url.trim() || null,
          }),
        },
      );
      if (!res.ok) throw new Error(await extractError(res));
      setModalOpen(false);
      showNotice(true, editing ? '已保存修改' : '已新增每日推荐');
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
      const res = await adminFetch(`/api/daily-picks/${deleting.id}`, {
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
        title="每日推荐"
        description="一天一条，按日期倒序；未解锁用户只能看到封面与标题，内容文件存私有桶"
        createLabel="新增每日推荐"
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
              <th className={thCls}>日期</th>
              <th className={thCls}>标题</th>
              <th className={thCls}>封面</th>
              <th className={thCls}>内容</th>
              <th className={thCls}>跳转链接</th>
              <th className={thCls}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <LoadingRows colSpan={6} />
            ) : rows.length === 0 ? (
              <EmptyRow
                colSpan={6}
                text="还没有每日推荐内容，新增后前台「每日推荐」区块即可展示"
                createLabel="新增每日推荐"
                onCreate={openCreate}
              />
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-apple-bg/60">
                  <td className={`${tdCls} whitespace-nowrap font-medium`}>
                    {row.pick_date}
                  </td>
                  <td className={`${tdCls} max-w-[220px] truncate`}>{row.title}</td>
                  <td className={tdCls}>
                    <Thumb src={row.cover_url} alt={`${row.title} 封面`} />
                  </td>
                  <td className={tdCls}>
                    {row.media_path ? (
                      <div className="flex items-center gap-2">
                        <Thumb src={row.media_preview_url} alt={`${row.title} 内容`} />
                        <Badge tone="blue">
                          {MEDIA_KIND_LABEL[
                            row.media_preview_url
                              ? classifyMedia(row.media_preview_url)
                              : classifyMedia(row.media_path)
                          ]}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-apple-text-3">—</span>
                    )}
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
        title={editing ? '编辑每日推荐' : '新增每日推荐'}
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
              form="daily-pick-form"
              className={btnPrimary}
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        <form id="daily-pick-form" onSubmit={handleSave} className="space-y-4">
          <Field label="更新日期" required hint="一天一条；前台「今日更新」按北京时区匹配该日期">
            <input
              className={inputCls}
              type="date"
              value={form.pick_date}
              onChange={(e) => setForm((f) => ({ ...f, pick_date: e.target.value }))}
            />
          </Field>
          <Field label="标题" required hint="未解锁用户也能看到（展示区块 / 历史仓库列表）">
            <input
              className={inputCls}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="如：第 12 期 · 主题名称"
              maxLength={60}
            />
          </Field>
          <Field label="介绍" hint="解锁后在内容页展示，选填">
            <textarea
              className={textareaCls}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="本期内容简介…"
              maxLength={600}
            />
          </Field>
          <Field label="封面图" hint="公开展示（选购页区块卡片图），选填；建议 16:9">
            <ImageUploader
              value={form.cover_url || null}
              onChange={(url) => setForm((f) => ({ ...f, cover_url: url ?? '' }))}
            />
          </Field>
          <Field
            label="内容文件"
            hint="存入私有桶，仅解锁用户可看（1 小时签名链接）；图片 / PDF / TXT"
          >
            <FileUploader
              bucket="daily"
              value={form.media_preview || null}
              onChange={(url, path) =>
                setForm((f) => ({
                  ...f,
                  media_preview: url ?? '',
                  media_path: path ?? '',
                }))
              }
            />
          </Field>
          <Field label="跳转链接" hint="选填；如视频放网盘/外部平台，填链接即可，可与内容文件并存">
            <input
              className={inputCls}
              value={form.link_url}
              onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
              placeholder="https://…"
              inputMode="url"
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
        title="删除每日推荐"
        message={
          deleting
            ? `确定要删除「${deleting.pick_date} ${deleting.title}」吗？此操作不可恢复。`
            : ''
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

'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Bell, ChevronDown } from 'lucide-react';
import {
  type Subscription,
  type SubscriptionProductAdminRow,
} from '@/lib/types';
import { classifyMedia, type MediaKind } from '@/lib/upload';
import { adminFetch, extractError } from '@/lib/admin-fetch';
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
  title: string;
  description: string;
  cover_url: string;
  /** 内容文件在私有桶 daily 的对象路径（入库字段） */
  media_path: string;
  /** 内容文件的签名预览链接（仅表单预览，不入库） */
  media_preview: string;
  link_url: string;
  sort_order: string;
}

const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  image: '图片',
  video: '视频',
  doc: '文档',
};

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  cover_url: '',
  media_path: '',
  media_preview: '',
  link_url: '',
  sort_order: '0',
};

/** 订阅仓库：选订阅 → 管理其下订阅商品 + 推送更新给已解锁用户 */
export default function SubscriptionReposManager() {
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  const [subsError, setSubsError] = useState<string | null>(null);

  const [products, setProducts] = useState<SubscriptionProductAdminRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SubscriptionProductAdminRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<SubscriptionProductAdminRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [pushBusy, setPushBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const showNotice = useCallback((okFlag: boolean, text: string) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice({ ok: okFlag, text });
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3000);
  }, []);

  const loadSubs = useCallback(async () => {
    setSubsError(null);
    try {
      const res = await adminFetch('/api/subscriptions');
      if (!res.ok) throw new Error(await extractError(res));
      const rows = (await res.json()) as Subscription[];
      setSubs(rows);
      setSelectedSub((cur) => cur ?? rows[0]?.id ?? null);
    } catch (e) {
      setSubsError(e instanceof Error ? e.message : '加载订阅失败');
      setSubs(null);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    if (!selectedSub) return;
    setLoadError(null);
    try {
      const res = await adminFetch(
        `/api/subscription-products?subscription_id=${encodeURIComponent(selectedSub)}`,
      );
      if (!res.ok) throw new Error(await extractError(res));
      const data = (await res.json()) as { items: SubscriptionProductAdminRow[] };
      setProducts(data.items);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载商品失败');
      setProducts(null);
    }
  }, [selectedSub]);

  useEffect(() => {
    void loadSubs();
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, [loadSubs]);

  useEffect(() => {
    if (selectedSub !== null) void loadProducts();
  }, [selectedSub, loadProducts]);

  const selectedTitle =
    subs?.find((s) => s.id === selectedSub)?.name ?? '请选择订阅';

  const openCreate = () => {
    if (!selectedSub) {
      showNotice(false, '请先在「订阅管理」创建订阅并在此选择');
      return;
    }
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (row: SubscriptionProductAdminRow) => {
    setEditing(row);
    setForm({
      title: row.title,
      description: row.description ?? '',
      cover_url: row.cover_url ?? '',
      media_path: row.media_path ?? '',
      media_preview: row.media_preview_url ?? '',
      link_url: row.link_url ?? '',
      sort_order: String(row.sort_order),
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const title = form.title.trim();
    if (!title) return setFormError('请填写商品标题');
    const sortOrder = Number(form.sort_order);
    if (!Number.isFinite(sortOrder)) return setFormError('排序必须是数字');

    setSaving(true);
    setFormError(null);
    try {
      const body = {
        title,
        description: form.description.trim() || null,
        cover_url: form.cover_url.trim() || null,
        media_path: form.media_path.trim() || null,
        link_url: form.link_url.trim() || null,
        sort_order: sortOrder,
      };
      const res = await adminFetch(
        editing ? `/api/subscription-products/${editing.id}` : '/api/subscription-products',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            editing
              ? body
              : { subscription_id: selectedSub, ...body },
          ),
        },
      );
      if (!res.ok) throw new Error(await extractError(res));
      setModalOpen(false);
      showNotice(true, editing ? '已保存修改' : '已新增商品');
      await loadProducts();
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
      const res = await adminFetch(`/api/subscription-products/${deleting.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await extractError(res));
      setDeleting(null);
      showNotice(true, '已删除');
      await loadProducts();
    } catch (err) {
      showNotice(false, err instanceof Error ? err.message : '删除失败');
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handlePush = async () => {
    if (!selectedSub || pushBusy) return;
    setPushBusy(true);
    try {
      const res = await adminFetch(`/api/subscriptions/${selectedSub}/push`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(await extractError(res));
      showNotice(
        true,
        data?.pushed ? `已推送通知给 ${data.pushed} 位订阅用户` : '暂无该订阅的用户',
      );
    } catch (err) {
      showNotice(false, err instanceof Error ? err.message : '推送失败');
    } finally {
      setPushBusy(false);
    }
  };

  const renderBody = () => {
    if (loadError) {
      return (
        <div className="rounded-card border border-apple-border bg-apple-card p-6 text-center shadow-card">
          <p className="text-[14px] leading-relaxed text-apple-text-2">{loadError}</p>
          <button type="button" onClick={() => void loadProducts()} className={`${btnGhost} mt-4`}>
            重试
          </button>
        </div>
      );
    }
    return (
      <TableShell>
        <thead>
          <tr>
            <th className={thCls}>排序</th>
            <th className={thCls}>标题</th>
            <th className={thCls}>封面</th>
            <th className={thCls}>内容</th>
            <th className={thCls}>跳转链接</th>
            <th className={thCls}>操作</th>
          </tr>
        </thead>
        <tbody>
          {products === null ? (
            <LoadingRows colSpan={6} />
          ) : products.length === 0 ? (
            <EmptyRow
              colSpan={6}
              text="该订阅下还没有商品，新增后已解锁用户的仓库会自动同步"
              createLabel="新增商品"
              onCreate={openCreate}
            />
          ) : (
            products.map((row) => (
              <tr key={row.id} className="transition hover:bg-apple-bg/60">
                <td className={tdCls}>{row.sort_order}</td>
                <td className={`${tdCls} max-w-[220px] truncate font-medium`}>{row.title}</td>
                <td className={tdCls}>
                  <Thumb src={row.cover_url} alt={`${row.title} 封面`} />
                </td>
                <td className={tdCls}>
                  {row.media_path ? (
                    <div className="flex items-center gap-2">
                      <Thumb src={row.media_preview_url} alt={`${row.title} 内容`} />
                      <Badge tone="blue">
                        {MEDIA_KIND_LABEL[classifyMedia(row.media_preview_url ?? row.media_path)]}
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
                  <RowActions onEdit={() => openEdit(row)} onDelete={() => setDeleting(row)} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
    );
  };

  return (
    <>
      <PageHeader
        title="订阅仓库"
        description="给某个订阅维护一组付费内容；解锁该订阅的用户仓库自动可见，更新后可推送通知"
        createLabel="新增商品"
        onCreate={openCreate}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <select
            className={`${inputCls} appearance-none pr-9`}
            value={selectedSub ?? ''}
            onChange={(e) => setSelectedSub(e.target.value || null)}
            disabled={!subs || subs.length === 0}
          >
            {!subs || subs.length === 0 ? (
              <option value="">暂无订阅，请先在「订阅管理」创建</option>
            ) : (
              subs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            )}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-apple-text-3"
            aria-hidden
          />
        </div>
        <button
          type="button"
          onClick={() => void handlePush()}
          disabled={!selectedSub || pushBusy}
          className="inline-flex h-9 items-center gap-1.5 rounded-btn border border-apple-border bg-white px-3.5 text-[13px] font-medium text-apple-text transition hover:bg-apple-bg active:scale-95 disabled:opacity-50"
        >
          <Bell className="h-3.5 w-3.5" aria-hidden />
          {pushBusy ? '推送中…' : `推送更新给「${selectedTitle}」订阅用户`}
        </button>
        {subsError && <span className="text-[13px] text-[#D70015]">{subsError}</span>}
      </div>

      {renderBody()}

      <Modal
        open={modalOpen}
        title={editing ? '编辑商品' : '新增商品'}
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
              form="subscription-product-form"
              className={btnPrimary}
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        <form id="subscription-product-form" onSubmit={handleSave} className="space-y-4">
          <Field label="商品标题" required>
            <input
              className={inputCls}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="如：第 1 期 · 主题名称"
              maxLength={60}
            />
          </Field>
          <Field label="介绍" hint="解锁后在仓库展示，选填">
            <textarea
              className={textareaCls}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="本期内容简介…"
              maxLength={600}
            />
          </Field>
          <Field label="封面图" hint="公开 teaser（未解锁也可见），选填；建议 16:9">
            <ImageUploader
              value={form.cover_url || null}
              onChange={(url) => setForm((f) => ({ ...f, cover_url: url ?? '' }))}
            />
          </Field>
          <Field
            label="内容文件"
            hint="存入私有桶，仅解锁该订阅的用户可看（1 小时签名链接）；图片 / 视频 / PDF / TXT"
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
          <Field label="跳转链接" hint="选填；如视频放网盘/外部平台，可与内容文件并存">
            <input
              className={inputCls}
              value={form.link_url}
              onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
              placeholder="https://…"
              inputMode="url"
            />
          </Field>
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
        title="删除商品"
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

'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Pin, PinOff } from 'lucide-react';
import type { CommunityPost } from '@/lib/community';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import {
  Field,
  PageHeader,
  TableShell,
  Badge,
  LoadingRows,
  EmptyRow,
  Notice,
  textareaCls,
  btnPrimary,
  btnGhost,
  thCls,
  tdCls,
} from './ui';

export default function CommunityManager() {
  const [rows, setRows] = useState<CommunityPost[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createContent, setCreateContent] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [deleting, setDeleting] = useState<CommunityPost | null>(null);
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
      const res = await adminFetch('/api/community');
      if (!res.ok) throw new Error(await extractError(res));
      const data = (await res.json()) as { posts: CommunityPost[] };
      setRows(data.posts ?? []);
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

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (creating) return;
    const content = createContent.trim();
    if (!content) return setCreateError('内容不能为空');
    setCreating(true);
    setCreateError(null);
    try {
      const res = await adminFetch('/api/community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, is_pinned: true }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      setCreateOpen(false);
      setCreateContent('');
      showNotice(true, '已发布置顶通知');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '发布失败');
    } finally {
      setCreating(false);
    }
  };

  const togglePin = async (row: CommunityPost) => {
    const next = !row.is_pinned;
    const res = await adminFetch(`/api/community/posts/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_pinned: next }),
    });
    if (!res.ok) {
      showNotice(false, await extractError(res));
      return;
    }
    showNotice(true, next ? '已置顶' : '已取消置顶');
    setRows((prev) =>
      (prev ?? []).map((p) => (p.id === row.id ? { ...p, is_pinned: next } : p)),
    );
  };

  const handleDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await adminFetch(`/api/community/posts/${deleting.id}`, {
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
        title="社区管理"
        description="发布置顶通知、管理用户帖子；7 天前的普通帖会在前台浏览时被自动清理"
        createLabel="发布置顶通知"
        onCreate={() => {
          setCreateOpen(true);
          setCreateContent('');
          setCreateError(null);
        }}
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
              <th className={thCls}>状态</th>
              <th className={thCls}>内容</th>
              <th className={thCls}>作者</th>
              <th className={thCls}>互动</th>
              <th className={thCls}>时间</th>
              <th className={thCls}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <LoadingRows colSpan={6} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={6} text="社区还没有帖子" />
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-apple-bg/60">
                  <td className={tdCls}>
                    {row.is_pinned ? <Badge tone="blue">置顶通知</Badge> : <Badge tone="gray">普通</Badge>}
                  </td>
                  <td className={tdCls}>
                    <p className="line-clamp-2 max-w-[280px] text-[13px] leading-relaxed text-apple-text">
                      {row.content}
                    </p>
                  </td>
                  <td className={tdCls}>
                    {row.is_pinned ? '管理员' : (row.user_email?.split('@')[0] ?? '用户')}
                  </td>
                  <td className={tdCls}>
                    <span className="text-[13px] text-apple-text-2">
                      赞 {row.like_count} · 评 {row.comment_count}
                    </span>
                  </td>
                  <td className={`${tdCls} whitespace-nowrap text-[13px] text-apple-text-2`}>
                    {new Date(row.created_at).toLocaleString('zh-CN')}
                  </td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => void togglePin(row)}
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
                      >
                        {row.is_pinned ? (
                          <PinOff className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <Pin className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {row.is_pinned ? '取消置顶' : '置顶'}
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

      <Modal
        open={createOpen}
        title="发布置顶通知"
        onClose={() => {
          if (!creating) setCreateOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className={btnGhost}
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              取消
            </button>
            <button
              type="submit"
              form="community-create-form"
              className={btnPrimary}
              disabled={creating}
            >
              {creating ? '发布中…' : '发布'}
            </button>
          </>
        }
      >
        <form id="community-create-form" onSubmit={handleCreate} className="space-y-4">
          <Field
            label="通知内容"
            hint="发布后将置顶展示在社区顶部，前台带「置顶通知」标记"
          >
            <textarea
              className={textareaCls}
              value={createContent}
              onChange={(e) => setCreateContent(e.target.value)}
              rows={4}
              placeholder="写一条置顶通知…"
              maxLength={2000}
            />
          </Field>
          {createError && (
            <p className="text-[13px] text-[#D70015]" role="alert">
              {createError}
            </p>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="删除帖子"
        message={
          deleting
            ? `确定要删除「${deleting.content.slice(0, 20) ?? '该帖子'}」吗？评论与点赞一并删除，此操作不可恢复。`
            : ''
        }
        busy={deleteBusy}
        onConfirm={handleDelete}
        onClose={() => {
          if (!deleteBusy) setDeleting(null);
        }}
      />
    </>
  );
}

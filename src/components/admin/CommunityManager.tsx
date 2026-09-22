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
  BulkBar,
  RowCheckbox,
  SelectAllCheckbox,
  bulkDelete,
  bulkResultText,
  useBulkSelect,
} from './BulkBar';
import {
  Field,
  PageHeader,
  TableShell,
  Badge,
  LoadingRows,
  EmptyRow,
  Notice,
  Pagination,
  textareaCls,
  btnPrimary,
  btnGhost,
  thCls,
  tdCls,
} from './ui';

/** GET /api/admin/comments 行 */
interface AdminComment {
  id: string;
  post_id: string;
  user_id: string;
  user_email: string | null;
  content: string;
  created_at: string;
  /** 所属帖子正文摘要（服务端截前 40 字） */
  post_excerpt: string;
}

/** GET /api/admin/comments 响应 */
interface CommentsResponse {
  items: AdminComment[];
  total: number;
  page: number;
  page_size: number;
}

/** 评论列表每页条数（请求与 Pagination 共用同一常量） */
const COMMENT_PAGE_SIZE = 20;

export default function CommunityManager() {
  const [rows, setRows] = useState<CommunityPost[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createContent, setCreateContent] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [deleting, setDeleting] = useState<CommunityPost | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // 批量删除（勾选 + 底部批量条）
  const bulk = useBulkSelect((rows ?? []).map((r) => r.id));
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  // 评论区块（独立分页 + 独立批量状态，与帖子的 bulk 互不影响）
  const [comments, setComments] = useState<AdminComment[] | null>(null);
  const [commentLoadError, setCommentLoadError] = useState<string | null>(null);
  const [commentPage, setCommentPage] = useState(1);
  const [commentTotal, setCommentTotal] = useState(0);
  const [commentDeletingId, setCommentDeletingId] = useState<string | null>(null);
  const commentBulk = useBulkSelect((comments ?? []).map((c) => c.id));
  const [commentBulkConfirm, setCommentBulkConfirm] = useState(false);
  const [commentBulkBusy, setCommentBulkBusy] = useState(false);

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

  /** 评论列表（服务端分页，按时间倒序） */
  const loadComments = useCallback(async () => {
    setCommentLoadError(null);
    try {
      const sp = new URLSearchParams();
      sp.set('page', String(commentPage));
      sp.set('page_size', String(COMMENT_PAGE_SIZE));
      const res = await adminFetch(`/api/admin/comments?${sp.toString()}`);
      if (!res.ok) throw new Error(await extractError(res));
      const data = (await res.json()) as CommentsResponse;
      setComments(data.items ?? []);
      setCommentTotal(data.total ?? 0);
    } catch (e) {
      setCommentLoadError(e instanceof Error ? e.message : '加载失败');
      setComments(null);
      setCommentTotal(0);
    }
  }, [commentPage]);

  useEffect(() => {
    void load();
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, [load]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

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

  /** 批量删除选中帖子（评论与点赞由 DB 级联删除） */
  const handleBulkDelete = async () => {
    if (bulkBusy) return;
    setBulkBusy(true);
    try {
      const r = await bulkDelete('community_posts', [...bulk.selected]);
      showNotice(r.failed.length === 0, bulkResultText(r, '删除'));
      setBulkConfirm(false);
      bulk.clear();
      await load();
    } catch (err) {
      showNotice(false, err instanceof Error ? err.message : '批量删除失败');
    } finally {
      setBulkBusy(false);
    }
  };

  /** 单条删除评论（走既有评论删除路由，管理员身份放行） */
  const handleDeleteComment = async (row: AdminComment) => {
    if (commentDeletingId) return;
    setCommentDeletingId(row.id);
    try {
      const res = await adminFetch(
        `/api/community/posts/${row.post_id}/comments/${row.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error(await extractError(res));
      showNotice(true, '已删除');
      await loadComments();
    } catch (err) {
      showNotice(false, err instanceof Error ? err.message : '删除失败');
    } finally {
      setCommentDeletingId(null);
    }
  };

  /** 批量删除选中评论 */
  const handleCommentBulkDelete = async () => {
    if (commentBulkBusy) return;
    setCommentBulkBusy(true);
    try {
      const r = await bulkDelete('community_comments', [...commentBulk.selected]);
      showNotice(r.failed.length === 0, bulkResultText(r, '删除'));
      setCommentBulkConfirm(false);
      commentBulk.clear();
      await loadComments();
    } catch (err) {
      showNotice(false, err instanceof Error ? err.message : '批量删除失败');
    } finally {
      setCommentBulkBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="探究管理"
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
              <th className={thCls}>
                <SelectAllCheckbox
                  checked={bulk.allSelected}
                  indeterminate={bulk.someSelected}
                  onChange={bulk.toggleAll}
                  label="全选当前列表"
                />
              </th>
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
              <LoadingRows colSpan={7} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={7} text="探究还没有帖子" />
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-apple-bg/60">
                  <td className={tdCls}>
                    <RowCheckbox
                      checked={bulk.selected.has(row.id)}
                      onChange={() => bulk.toggle(row.id)}
                      label={`选择「${row.content.slice(0, 12)}」`}
                    />
                  </td>
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

      {/* 评论区块：全站评论分页浏览，支持单条删除与批量删除 */}
      <h2 className="mb-3 mt-8 text-[16px] font-semibold text-apple-text">
        评论
        {comments !== null && (
          <span className="ml-2 text-[13px] font-normal text-apple-text-2">
            共 {commentTotal} 条
          </span>
        )}
      </h2>

      {commentLoadError ? (
        <div className="rounded-card border border-apple-border bg-apple-card p-6 text-center shadow-card">
          <p className="text-[14px] leading-relaxed text-apple-text-2">{commentLoadError}</p>
          <button type="button" onClick={() => void loadComments()} className={`${btnGhost} mt-4`}>
            重试
          </button>
        </div>
      ) : (
        <>
          <TableShell>
            <thead>
              <tr>
                <th className={thCls}>
                  <SelectAllCheckbox
                    checked={commentBulk.allSelected}
                    indeterminate={commentBulk.someSelected}
                    onChange={commentBulk.toggleAll}
                    label="全选当前页评论"
                  />
                </th>
                <th className={thCls}>评论内容</th>
                <th className={thCls}>所属帖子</th>
                <th className={thCls}>作者</th>
                <th className={thCls}>时间</th>
                <th className={thCls}>操作</th>
              </tr>
            </thead>
            <tbody>
              {comments === null ? (
                <LoadingRows colSpan={6} />
              ) : comments.length === 0 ? (
                <EmptyRow colSpan={6} text="还没有评论" />
              ) : (
                comments.map((row) => (
                  <tr key={row.id} className="transition hover:bg-apple-bg/60">
                    <td className={tdCls}>
                      <RowCheckbox
                        checked={commentBulk.selected.has(row.id)}
                        onChange={() => commentBulk.toggle(row.id)}
                        label={`选择「${row.content.slice(0, 12)}」`}
                      />
                    </td>
                    <td className={tdCls}>
                      <p className="line-clamp-2 max-w-[280px] text-[13px] leading-relaxed text-apple-text">
                        {row.content}
                      </p>
                    </td>
                    <td
                      className={`${tdCls} max-w-[200px] truncate text-[13px] text-apple-text-2`}
                      title={row.post_excerpt}
                    >
                      {row.post_excerpt || '—'}
                    </td>
                    <td className={tdCls}>{row.user_email?.split('@')[0] ?? '用户'}</td>
                    <td className={`${tdCls} whitespace-nowrap text-[13px] text-apple-text-2`}>
                      {new Date(row.created_at).toLocaleString('zh-CN')}
                    </td>
                    <td className={tdCls}>
                      <button
                        type="button"
                        onClick={() => void handleDeleteComment(row)}
                        disabled={commentDeletingId === row.id}
                        className="text-[13px] font-medium text-[#D70015] transition hover:opacity-80 disabled:opacity-40"
                      >
                        {commentDeletingId === row.id ? '删除中…' : '删除'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>

          <Pagination
            page={commentPage}
            pageSize={COMMENT_PAGE_SIZE}
            total={commentTotal}
            onChange={setCommentPage}
          />
        </>
      )}

      <BulkBar
        count={commentBulk.selected.size}
        noun="条评论"
        busy={commentBulkBusy}
        onClear={commentBulk.clear}
        actions={[
          { key: 'delete', text: '批量删除', danger: true, onClick: () => setCommentBulkConfirm(true) },
        ]}
      />

      <ConfirmDialog
        open={commentBulkConfirm}
        title="批量删除评论"
        message={`确定要删除选中的 ${commentBulk.selected.size} 条评论吗？此操作不可恢复。`}
        busy={commentBulkBusy}
        onConfirm={handleCommentBulkDelete}
        onClose={() => {
          if (!commentBulkBusy) setCommentBulkConfirm(false);
        }}
      />

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
            hint="发布后将置顶展示在探究顶部，前台带「置顶通知」标记"
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

      <BulkBar
        count={bulk.selected.size}
        noun="个帖子"
        busy={bulkBusy}
        onClear={bulk.clear}
        actions={[{ key: 'delete', text: '批量删除', danger: true, onClick: () => setBulkConfirm(true) }]}
      />

      <ConfirmDialog
        open={bulkConfirm}
        title="批量删除帖子"
        message={`确定要删除选中的 ${bulk.selected.size} 个帖子吗？评论与点赞一并删除，此操作不可恢复。`}
        note="删除后不可恢复；如需保留请先取消选择。"
        busy={bulkBusy}
        onConfirm={handleBulkDelete}
        onClose={() => {
          if (!bulkBusy) setBulkConfirm(false);
        }}
      />

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

'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import { reportReasonLabel } from '@/lib/report-reasons';
import { thCls, tdCls, PageHeader, Notice, Badge, btnGhost, Pagination, LoadingRows, EmptyRow } from './ui';

const PAGE_SIZE = 20;

interface ReportRow {
  id: string;
  post_id: string;
  reporter_id: string;
  reason: string;
  detail: string | null;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at: string;
  handled_at: string | null;
  post_excerpt: string | null;
  post_deleted: boolean;
  reporter: { display_name: string } | null;
}

type Filter = '' | 'pending' | 'resolved' | 'dismissed';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'pending', label: '待处理' },
  { key: '', label: '全部' },
  { key: 'resolved', label: '已处理' },
  { key: 'dismissed', label: '已驳回' },
];

const STATUS_LABEL: Record<ReportRow['status'], { text: string; tone: 'red' | 'green' | 'gray' }> = {
  pending: { text: '待处理', tone: 'red' },
  resolved: { text: '已处理', tone: 'green' },
  dismissed: { text: '已驳回', tone: 'gray' },
};

/**
 * 举报管理（2026-09-22，来自 UI.docx 的 Report）。
 *
 * 只做「看 + 标记状态」，**不提供删帖按钮**：删帖在帖子管理里做。
 * 把两件事放在同一个按钮上，误点一下就连帖子带举报一起没了。
 */
export default function ReportsManager() {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>('pending');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (filter) params.set('status', filter);

    const res = await adminFetch(`/api/admin/reports?${params}`);
    if (!res.ok) {
      setRows([]);
      setNotice({ ok: false, text: await extractError(res) });
      return;
    }
    const data = (await res.json()) as { items: ReportRow[]; total: number };
    setRows(data.items ?? []);
    setTotal(data.total ?? 0);
  }, [page, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(t);
  }, [notice]);

  const handleStatus = async (row: ReportRow, status: ReportRow['status']) => {
    setBusyId(row.id);
    const res = await adminFetch('/api/admin/reports', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, status }),
    });
    setBusyId(null);
    if (!res.ok) {
      setNotice({ ok: false, text: await extractError(res) });
      return;
    }
    setNotice({ ok: true, text: status === 'resolved' ? '已标记为处理完成' : '已驳回' });
    await load();
  };

  return (
    <div>
      <PageHeader title="举报管理" description="用户对帖子的举报，处理完请标记状态" />

      <Notice notice={notice} />

      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key || 'all'}
            type="button"
            onClick={() => {
              setFilter(f.key);
              setPage(1);
            }}
            className={
              filter === f.key
                ? 'rounded-btn bg-apple-blue px-3.5 py-1.5 text-[13px] font-medium text-white'
                : 'rounded-btn bg-apple-bg px-3.5 py-1.5 text-[13px] text-apple-text-2 hover:text-apple-text'
            }
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto self-center text-[13px] text-apple-text-3">
          共 {total} 条
        </span>
      </div>

      <div className="overflow-x-auto rounded-card border border-apple-hairline bg-apple-card">
        <table className="w-full min-w-[880px] border-collapse">
          <thead className="bg-apple-bg">
            <tr>
              <th className={thCls}>状态</th>
              <th className={thCls}>理由</th>
              <th className={thCls}>被举报帖子</th>
              <th className={thCls}>举报人</th>
              <th className={thCls}>时间</th>
              <th className={thCls}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <LoadingRows colSpan={6} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={6} text="没有举报记录" />
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-apple-hairline">
                  <td className={tdCls}>
                    <Badge tone={STATUS_LABEL[row.status].tone}>
                      {STATUS_LABEL[row.status].text}
                    </Badge>
                  </td>
                  <td className={tdCls}>
                    <span className="font-medium">{reportReasonLabel(row.reason)}</span>
                    {row.detail && (
                      <p className="mt-1 max-w-[220px] whitespace-pre-wrap text-[12px] text-apple-text-3">
                        {row.detail}
                      </p>
                    )}
                  </td>
                  <td className={tdCls}>
                    {row.post_deleted ? (
                      <span className="text-apple-text-3">（帖子已删除）</span>
                    ) : (
                      <span className="line-clamp-2 max-w-[260px]">{row.post_excerpt}</span>
                    )}
                  </td>
                  <td className={tdCls}>
                    {row.reporter?.display_name ?? '(未知用户)'}
                  </td>
                  <td className={tdCls}>
                    {new Date(row.created_at).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className={tdCls}>
                    <div className="flex gap-2">
                      {row.status !== 'resolved' && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void handleStatus(row, 'resolved')}
                          className="rounded-btn bg-apple-success/10 px-2.5 py-1 text-[13px] font-medium text-apple-success hover:bg-apple-success/20 disabled:opacity-40"
                        >
                          标记已处理
                        </button>
                      )}
                      {row.status !== 'dismissed' && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void handleStatus(row, 'dismissed')}
                          className={btnGhost}
                        >
                          驳回
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

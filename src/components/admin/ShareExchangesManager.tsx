'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import {
  PageHeader,
  Notice,
  Badge,
  Thumb,
  btnGhost,
  thCls,
  tdCls,
  Pagination,
  LoadingRows,
  EmptyRow,
} from './ui';
import Modal from './Modal';

const PAGE_SIZE = 20;

type ShareStatus = 'pending' | 'approved' | 'rejected' | 'canceled';

interface Row {
  id: string;
  user_email: string | null;
  status: ShareStatus;
  resource_kind: 'link' | 'image';
  /** 通过前为 null —— 官方此刻只有参考图可看 */
  resource_url: string | null;
  resource_note: string | null;
  ref_image_url: string;
  wanted_name: string;
  review_note: string | null;
  handled_at: string | null;
  created_at: string;
}

const FILTERS: Array<{ key: '' | ShareStatus; label: string }> = [
  { key: 'pending', label: '待处理' },
  { key: '', label: '全部' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '未通过' },
  { key: 'canceled', label: '已撤回' },
];

const STATUS_LABEL: Record<ShareStatus, { text: string; tone: 'red' | 'green' | 'gray' | 'blue' }> = {
  pending: { text: '待处理', tone: 'red' },
  approved: { text: '已通过', tone: 'green' },
  rejected: { text: '未通过', tone: 'gray' },
  canceled: { text: '已撤回', tone: 'blue' },
};

/**
 * 共享交换审核（2026-09-22，用户需求「共享」板块的后台）。
 *
 * 双边盲的关键在**这一页**：待处理时只显示**参考图**与用户想换的小单元，
 * 用户的资源链接/分享图要到通过之后才显示 —— 这是需求原文
 * 「官方只能看到用户的参考图」的落地，不是前端藏了一下，
 * 接口在 pending 状态下根本不返回 resource_url。
 *
 * 通过会自动把该小单元写进用户的「我的内容」，所以这里不需要再手工派发。
 */
export default function ShareExchangesManager() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<'' | ShareStatus>('pending');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** 正在处理的单据（弹层里填备注） */
  const [acting, setActing] = useState<{ row: Row; action: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (filter) params.set('status', filter);

    const res = await adminFetch(`/api/admin/share-exchanges?${params}`);
    if (!res.ok) {
      setRows([]);
      setNotice({ ok: false, text: await extractError(res) });
      return;
    }
    const data = (await res.json()) as { items: Row[]; total: number };
    setRows(data.items ?? []);
    setTotal(data.total ?? 0);
  }, [page, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(t);
  }, [notice]);

  const submit = async () => {
    if (!acting) return;
    setBusyId(acting.row.id);
    const res = await adminFetch(`/api/admin/share-exchanges/${acting.row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: acting.action, note }),
    });
    setBusyId(null);
    if (!res.ok) {
      setNotice({ ok: false, text: await extractError(res) });
      return;
    }
    setNotice({
      ok: true,
      text: acting.action === 'approve' ? '已通过，小单元已入库' : '已驳回',
    });
    setActing(null);
    setNote('');
    await load();
  };

  return (
    <div>
      <PageHeader
        title="共享审核"
        description="通过前你只能看到参考图与用户想要的小单元；通过后资源会解锁，并把该小单元派进用户的库"
      />

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
        <table className="w-full min-w-[1000px] border-collapse">
          <thead className="bg-apple-bg">
            <tr>
              <th className={thCls}>状态</th>
              <th className={thCls}>参考图</th>
              <th className={thCls}>想换的小单元</th>
              <th className={thCls}>用户资源</th>
              <th className={thCls}>用户</th>
              <th className={thCls}>时间</th>
              <th className={thCls}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <LoadingRows colSpan={7} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={7} text="没有共享交换记录" />
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-apple-hairline">
                  <td className={tdCls}>
                    <Badge tone={STATUS_LABEL[row.status].tone}>
                      {STATUS_LABEL[row.status].text}
                    </Badge>
                  </td>
                  <td className={tdCls}>
                    <Thumb src={row.ref_image_url} alt="参考图" />
                  </td>
                  <td className={tdCls}>
                    <span className="font-medium">{row.wanted_name}</span>
                  </td>
                  <td className={tdCls}>
                    {/* 通过前显示占位说明，而不是假装空白 */}
                    {row.resource_url ? (
                      <a
                        href={row.resource_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block max-w-[220px] truncate text-apple-blue underline-offset-2 hover:underline"
                        title={row.resource_url}
                      >
                        {row.resource_kind === 'image' ? '查看分享图' : row.resource_url}
                      </a>
                    ) : (
                      <span className="text-apple-text-3">通过后解锁</span>
                    )}
                    {row.resource_note && row.resource_url && (
                      <p className="mt-1 max-w-[220px] text-[12px] text-apple-text-3">
                        {row.resource_note}
                      </p>
                    )}
                  </td>
                  <td className={tdCls}>{row.user_email ?? '(未知)'}</td>
                  <td className={tdCls}>
                    {new Date(row.created_at).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className={tdCls}>
                    {row.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActing({ row, action: 'approve' });
                            setNote('');
                          }}
                          className="rounded-btn bg-apple-success/10 px-2.5 py-1 text-[13px] font-medium text-apple-success hover:bg-apple-success/20"
                        >
                          通过并派发
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActing({ row, action: 'reject' });
                            setNote('');
                          }}
                          className={btnGhost}
                        >
                          驳回
                        </button>
                      </div>
                    ) : (
                      <span className="text-apple-text-3">
                        {row.review_note ? `备注：${row.review_note}` : '—'}
                      </span>
                    )}
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

      <Modal
        open={Boolean(acting)}
        onClose={() => setActing(null)}
        title={acting?.action === 'approve' ? '通过这次交换？' : '驳回这次交换？'}
      >
        <div className="space-y-4">
          <p className="text-[14px] leading-relaxed text-apple-text-2">
            {acting?.action === 'approve' ? (
              <>
                小单元「{acting?.row.wanted_name}」会自动写进该用户的「我的库」，
                同时他的资源会对你解锁。
              </>
            ) : (
              <>用户会看到驳回结果；资源不会被解锁。</>
            )}
          </p>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-apple-text">
              备注（选填，用户可见）
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={300}
              className="w-full rounded-[10px] border border-apple-border bg-white px-3 py-2 text-[14px] text-apple-text outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20"
              placeholder={acting?.action === 'approve' ? '例如：已核对，感谢分享' : '例如：参考图与描述不符'}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setActing(null)} className={btnGhost}>
              取消
            </button>
            <button
              type="button"
              disabled={busyId === acting?.row.id}
              onClick={() => void submit()}
              className={
                acting?.action === 'approve'
                  ? 'rounded-btn bg-apple-success px-4 py-2 text-[14px] font-medium text-white disabled:opacity-40'
                  : 'rounded-btn bg-[#D70015] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-40'
              }
            >
              {busyId === acting?.row.id ? '处理中…' : '确认'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

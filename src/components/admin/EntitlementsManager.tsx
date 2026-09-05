'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import { formatDateTime } from '@/lib/format';
import type { UserEntitlement } from '@/lib/types';
import {
  PageHeader,
  TableShell,
  LoadingRows,
  EmptyRow,
  Notice,
  Badge,
  Field,
  inputCls,
  selectCls,
  btnGhost,
  btnPrimary,
  thCls,
  tdCls,
} from './ui';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';

/** 后台权益列表行（与 GET /api/entitlements 返回一致） */
interface EntitlementRow extends UserEntitlement {
  status: 'permanent' | 'active' | 'expired';
  remaining_days: number | null;
  source_code: string | null;
}

const KIND_LABEL: Record<UserEntitlement['kind'], string> = {
  daily_plan: '每日计划',
  content: '兑换内容',
};

const SOURCE_LABEL: Record<UserEntitlement['source'], string> = {
  redeem: '兑换',
  sync: '同步',
  admin: '后台',
};

/**
 * 用户权益管理（/admin/library）：
 * - 列表：邮箱 / 类型（含内容名快照）/ 来源码掩码 / 来源 / 解锁时间 / 到期状态
 * - 延长：仅每日计划且非永久行 —— 按天叠加（过期从当前时刻起算）或置永久
 * - 撤销：删权益 + 作废关联卡密（每日计划会作废该用户名下全部解锁码，防重放复活）
 */
export default function EntitlementsManager() {
  const [rows, setRows] = useState<EntitlementRow[] | null>(null);
  const [filterKind, setFilterKind] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [extending, setExtending] = useState<EntitlementRow | null>(null);
  const [revoking, setRevoking] = useState<EntitlementRow | null>(null);

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
      const res = await adminFetch('/api/entitlements');
      if (!res.ok) throw new Error(await extractError(res));
      setRows((await res.json()) as EntitlementRow[]);
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

  const visible =
    rows === null
      ? null
      : rows.filter((r) => (filterKind === '' ? true : r.kind === filterKind));

  return (
    <>
      <PageHeader
        title="用户权益"
        description="用户通过兑换码 / 同步获得的每日计划与兑换内容；可延长有效期或撤销（撤销会连带作废来源卡密）"
      />

      {/* 按类型筛选 */}
      <div className="mb-4 flex items-center gap-2.5">
        <label htmlFor="filter-kind" className="shrink-0 text-[13px] text-apple-text-2">
          按类型筛选
        </label>
        <select
          id="filter-kind"
          className={`${selectCls} w-40`}
          value={filterKind}
          onChange={(e) => setFilterKind(e.target.value)}
        >
          <option value="">全部</option>
          <option value="daily_plan">每日计划</option>
          <option value="content">兑换内容</option>
        </select>
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
              <th className={thCls}>用户邮箱</th>
              <th className={thCls}>类型</th>
              <th className={thCls}>来源码</th>
              <th className={thCls}>来源</th>
              <th className={thCls}>解锁时间</th>
              <th className={thCls}>到期</th>
              <th className={thCls}>操作</th>
            </tr>
          </thead>
          <tbody>
            {visible === null ? (
              <LoadingRows colSpan={7} />
            ) : visible.length === 0 ? (
              <EmptyRow
                colSpan={7}
                text={
                  rows?.length
                    ? '当前筛选条件下没有权益记录'
                    : '还没有用户权益，用户在「兑换」页输码或登录后同步即会产生记录'
                }
              />
            ) : (
              visible.map((row) => (
                <tr key={row.id} className="transition hover:bg-apple-bg/60">
                  <td className={tdCls}>
                    <span className="block max-w-[200px] truncate font-medium">
                      {row.user_email ?? '（无邮箱快照）'}
                    </span>
                    <span className="mt-0.5 block max-w-[200px] truncate font-mono text-[11px] text-apple-text-3">
                      {row.user_id}
                    </span>
                  </td>
                  <td className={tdCls}>
                    <Badge tone={row.kind === 'daily_plan' ? 'blue' : 'gray'}>
                      {KIND_LABEL[row.kind] ?? row.kind}
                    </Badge>
                    {row.kind === 'content' && row.name && (
                      <p className="mt-0.5 max-w-[180px] truncate text-[12px] text-apple-text-3">
                        {row.name}
                      </p>
                    )}
                  </td>
                  <td className={`${tdCls} whitespace-nowrap font-mono text-[12.5px] text-apple-text-2`}>
                    {row.source_code ?? '—'}
                  </td>
                  <td className={tdCls}>{SOURCE_LABEL[row.source] ?? row.source}</td>
                  <td className={`${tdCls} whitespace-nowrap text-apple-text-2`}>
                    {formatDateTime(row.unlocked_at)}
                  </td>
                  <td className={tdCls}>
                    {row.status === 'permanent' ? (
                      <Badge tone="green">永久</Badge>
                    ) : row.status === 'active' ? (
                      <>
                        <Badge tone="blue">生效中</Badge>
                        <p className="mt-0.5 whitespace-nowrap text-[12px] text-apple-text-3">
                          {formatDateTime(row.expires_at)}
                          {row.remaining_days != null ? ` · 剩余 ${row.remaining_days} 天` : ''}
                        </p>
                      </>
                    ) : (
                      <>
                        <Badge tone="red">已过期</Badge>
                        <p className="mt-0.5 whitespace-nowrap text-[12px] text-apple-text-3">
                          {formatDateTime(row.expires_at)}
                        </p>
                      </>
                    )}
                  </td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-4 whitespace-nowrap">
                      {row.kind === 'daily_plan' && row.status !== 'permanent' && (
                        <button
                          type="button"
                          onClick={() => setExtending(row)}
                          className="text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
                        >
                          延长
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setRevoking(row)}
                        className="text-[13px] font-medium text-[#D70015] transition hover:opacity-80"
                      >
                        撤销
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      )}

      {extending && (
        <ExtendModal
          row={extending}
          onDone={(text) => {
            setExtending(null);
            showNotice(true, text);
            void load();
          }}
          onError={(text) => showNotice(false, text)}
          onClose={() => setExtending(null)}
        />
      )}

      <RevokeDialog
        row={revoking}
        onDone={(text) => {
          setRevoking(null);
          showNotice(true, text);
          void load();
        }}
        onError={(text) => {
          setRevoking(null);
          showNotice(false, text);
        }}
        onClose={() => setRevoking(null)}
      />

      <Notice notice={notice} />
    </>
  );
}

/* ---------------- 延长有效期弹层 ---------------- */

function ExtendModal({
  row,
  onDone,
  onError,
  onClose,
}: {
  row: EntitlementRow;
  onDone: (text: string) => void;
  onError: (text: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'days' | 'permanent'>('days');
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (busy) return;
    let payload: Record<string, unknown>;
    if (mode === 'permanent') {
      payload = { permanent: true };
    } else {
      const n = Number(days);
      if (!Number.isInteger(n) || n < 1) {
        onError('延长天数必须为正整数');
        return;
      }
      payload = { days: n };
    }
    setBusy(true);
    try {
      const res = await adminFetch(`/api/entitlements/${row.id}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await extractError(res));
      onDone(mode === 'permanent' ? '已置为永久有效' : `已延长 ${payload.days} 天`);
    } catch (e) {
      onError(e instanceof Error ? e.message : '延长失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="延长有效期"
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <button
            type="button"
            className={btnGhost}
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button
            type="button"
            className={btnPrimary}
            onClick={() => void handleSubmit()}
            disabled={busy}
          >
            {busy ? '提交中…' : mode === 'permanent' ? '置为永久' : '确认延长'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-apple-text-2">
          用户 <span className="font-medium text-apple-text">{row.user_email ?? row.user_id}</span>{' '}
          的每日计划，当前到期：{formatDateTime(row.expires_at)}
          {row.status === 'expired' ? '（已过期）' : ''}
        </p>

        <Field label="延长方式">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('days')}
              className={`h-9 flex-1 rounded-xl border text-[13.5px] font-medium transition ${
                mode === 'days'
                  ? 'border-apple-blue bg-apple-blue-soft text-apple-blue'
                  : 'border-apple-border bg-white text-apple-text-2 hover:bg-apple-bg'
              }`}
            >
              按天延长
            </button>
            <button
              type="button"
              onClick={() => setMode('permanent')}
              className={`h-9 flex-1 rounded-xl border text-[13.5px] font-medium transition ${
                mode === 'permanent'
                  ? 'border-apple-blue bg-apple-blue-soft text-apple-blue'
                  : 'border-apple-border bg-white text-apple-text-2 hover:bg-apple-bg'
              }`}
            >
              置为永久
            </button>
          </div>
        </Field>

        {mode === 'days' ? (
          <Field label="延长天数" hint="从当前到期时间起叠加；已过期的权益从当前时刻起算。">
            <input
              type="number"
              min={1}
              step={1}
              className={inputCls}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </Field>
        ) : (
          <p className="rounded-xl bg-apple-bg px-3 py-2.5 text-[12.5px] leading-relaxed text-apple-text-2">
            置为永久后该用户每日计划不再有到期时间，后续仍可撤销。
          </p>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- 撤销确认弹层 ---------------- */

function RevokeDialog({
  row,
  onDone,
  onError,
  onClose,
}: {
  row: EntitlementRow | null;
  onDone: (text: string) => void;
  onError: (text: string) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (!row || busy) return;
    setBusy(true);
    try {
      const res = await adminFetch(`/api/entitlements/${row.id}/revoke`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await extractError(res));
      onDone('已撤销权益并作废关联卡密');
    } catch (e) {
      onError(e instanceof Error ? e.message : '撤销失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={Boolean(row)}
      title="撤销用户权益"
      message={
        row
          ? `确定要撤销「${row.user_email ?? row.user_id}」的${KIND_LABEL[row.kind]}权益吗？此操作不可恢复。`
          : ''
      }
      note={
        row?.kind === 'daily_plan'
          ? '撤销后该用户名下全部「解锁每日计划」兑换码将同步作废，用户无法通过重输码或同步恢复；如只是暂停服务，建议等自然到期。'
          : '撤销后来源兑换码将同步作废，用户无法通过重输码或同步恢复。'
      }
      confirmText="撤销"
      busy={busy}
      onConfirm={handleConfirm}
      onClose={() => {
        if (!busy) onClose();
      }}
    />
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, UserRound } from 'lucide-react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import { formatDateTime, formatPrice } from '@/lib/format';
import Avatar from '@/components/ui/Avatar';
import {
  Badge,
  EmptyRow,
  LoadingRows,
  Notice,
  PageHeader,
  TableShell,
  btnGhost,
  btnPrimary,
  inputCls,
  selectCls,
  tdCls,
  textareaCls,
  thCls,
} from './ui';

interface AccountRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_key: string | null;
  avatar_url: string | null;
  account_note: string | null;
  role: 'user' | 'staff' | 'admin';
  status: 'active' | 'banned';
  banned_until: string | null;
  restrictions: AccountRestriction[];
  last_sign_in_at: string | null;
  created_at: string | null;
}

interface AccountRestriction {
  id: string;
  scope: 'login' | 'coupon' | 'referral';
  kind: 'temporary' | 'permanent';
  reason: string;
  starts_at: string;
  ends_at: string | null;
}

interface AccountDetail {
  user: AccountRow;
  orders: Array<{
    id: string;
    order_no: string;
    status: string;
    payable: number;
    created_at: string;
  }>;
  subscriptions: Array<{
    id: string;
    name: string | null;
    expires_at: string | null;
    unlocked_at: string;
  }>;
  coupons: Array<{
    id: string;
    code: string;
    name: string | null;
    claimed_at: string;
    used_at: string | null;
  }>;
  audit_logs: Array<{
    id: string;
    action: string;
    before_state: Record<string, unknown>;
    after_state: Record<string, unknown>;
    reason: string | null;
    created_at: string;
  }>;
  audit_available: boolean;
}

const STATUS_LABEL: Record<AccountRow['status'], string> = {
  active: '正常',
  banned: '已限制',
};

const STATUS_TONE: Record<AccountRow['status'], 'green' | 'red'> = {
  active: 'green',
  banned: 'red',
};

const ROLE_LABEL: Record<AccountRow['role'], string> = {
  user: '用户',
  staff: '职员',
  admin: '管理员',
};

const BAN_OPTIONS = [
  { value: 'none', label: '解除封禁' },
  { value: '24h', label: '封禁 24 小时' },
  { value: '7d', label: '封禁 7 天' },
  { value: '30d', label: '封禁 30 天' },
  { value: 'permanent', label: '永久封禁' },
];

const BAN_SCOPE_OPTIONS = [
  { value: 'login', label: '限制登录' },
  { value: 'coupon', label: '限制领券' },
  { value: 'referral', label: '限制推广奖励' },
] as const;

const RESTRICTION_SCOPE_LABEL: Record<AccountRestriction['scope'], string> = {
  login: '限制登录',
  coupon: '限制领券',
  referral: '限制推广奖励',
};

export default function UsersManager() {
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [role, setRole] = useState('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [banValue, setBanValue] = useState('none');
  const [banScope, setBanScope] = useState<AccountRestriction['scope']>('login');
  const [roleValue, setRoleValue] = useState('user');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ query, status, role });
    const res = await adminFetch(`/api/admin/users?${params.toString()}`);
    if (!res.ok) {
      setRows([]);
      setNotice({ ok: false, text: await extractError(res) });
      return;
    }
    const data = (await res.json()) as { users: AccountRow[] };
    setRows(data.users ?? []);
  }, [query, status, role]);

  const loadDetail = useCallback(async (userId: string) => {
    const res = await adminFetch(`/api/admin/users/${userId}`);
    if (!res.ok) {
      setNotice({ ok: false, text: await extractError(res) });
      return;
    }
    const data = (await res.json()) as AccountDetail;
    setDetail(data);
    const loginRestriction = data.user.restrictions.find((item) => item.scope === 'login');
    setBanValue('none');
    setBanScope(loginRestriction?.scope ?? 'login');
    setRoleValue(data.user.role);
    setNote(data.user.account_note ?? '');
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadList(), query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [loadList, query]);

  useEffect(() => {
    if (!activeId) {
      setDetail(null);
      return;
    }
    void loadDetail(activeId);
  }, [activeId, loadDetail]);

  const patch = async (
    action: 'set_status' | 'set_role' | 'set_note',
    value: string | null,
    scope?: AccountRestriction['scope'],
  ) => {
    if (!activeId || busy) return;
    if (action === 'set_status' && value !== 'none' && !reason.trim()) {
      setNotice({ ok: false, text: '封禁原因必填' });
      return;
    }
    setBusy(true);
    try {
      const res = await adminFetch(`/api/admin/users/${activeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, value, scope, reason }),
      });
      if (!res.ok) {
        setNotice({ ok: false, text: await extractError(res) });
        return;
      }
      setNotice({ ok: true, text: '已保存' });
      setReason('');
      await Promise.all([loadList(), loadDetail(activeId)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="账号管理"
        description="搜索账号、调整状态与角色，并查看订单、订阅、优惠券和操作审计。"
        secondaryAction={
          <button type="button" className={btnGhost} onClick={() => void loadList()}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            刷新
          </button>
        }
      />

      <Notice notice={notice} />

      <div className="mb-4 grid gap-2 rounded-card border border-apple-border bg-apple-card p-3 md:grid-cols-[1fr_10rem_10rem]">
        <input
          className={inputCls}
          placeholder="搜索邮箱 / 昵称 / 用户 ID"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className={selectCls}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="状态筛选"
        >
          <option value="all">全部状态</option>
          <option value="active">正常</option>
          <option value="banned">已限制</option>
        </select>
        <select
          className={selectCls}
          value={role}
          onChange={(event) => setRole(event.target.value)}
          aria-label="角色筛选"
        >
          <option value="all">全部角色</option>
          <option value="user">用户</option>
          <option value="staff">职员</option>
          <option value="admin">管理员</option>
        </select>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,.75fr)]">
        <section>
          <TableShell>
            <thead>
              <tr>
                <th className={thCls}>用户</th>
                <th className={thCls}>角色</th>
                <th className={thCls}>状态</th>
                <th className={thCls}>注册时间</th>
                <th className={thCls}>最近登录</th>
                <th className={thCls}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <LoadingRows colSpan={6} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={6} text="没有符合条件的账号" />
              ) : (
                rows.map((row) => (
                  <tr key={row.user_id} className="transition hover:bg-apple-bg/60">
                    <td className={tdCls}>
                      <div className="flex items-center gap-2.5">
                        <Avatar
                          avatarKey={row.avatar_key}
                          avatarUrl={row.avatar_url}
                          name={row.display_name ?? row.email ?? '用户'}
                          size={32}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium">
                            {row.display_name ?? row.email ?? '（无邮箱）'}
                          </p>
                          <p className="truncate text-[12px] text-apple-text-3">{row.email ?? '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className={tdCls}>
                      <Badge tone={row.role === 'admin' ? 'blue' : 'gray'}>
                        {ROLE_LABEL[row.role]}
                      </Badge>
                    </td>
                    <td className={tdCls}>
                      <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                    </td>
                    <td className={`${tdCls} whitespace-nowrap text-[13px] text-apple-text-2`}>
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap text-[13px] text-apple-text-2`}>
                      {formatDateTime(row.last_sign_in_at)}
                    </td>
                    <td className={tdCls}>
                      <button
                        type="button"
                        className="text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
                        onClick={() => setActiveId(row.user_id)}
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </section>

        <section className="rounded-card border border-apple-border bg-apple-card p-4">
          {!detail ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-apple-bg">
                <UserRound className="h-6 w-6 text-apple-text-3" aria-hidden />
              </span>
              <p className="text-[14px] text-apple-text-2">选择一个账号查看详情</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <Avatar
                  avatarKey={detail.user.avatar_key}
                  avatarUrl={detail.user.avatar_url}
                  name={detail.user.display_name ?? detail.user.email ?? '用户'}
                  size={48}
                />
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold">
                    {detail.user.display_name ?? detail.user.email ?? '（无邮箱）'}
                  </p>
                  <p className="truncate text-[12px] text-apple-text-3">{detail.user.user_id}</p>
                </div>
              </div>

              <div className="grid gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium">封禁范围</span>
                  <select
                    className={selectCls}
                    value={banScope}
                    onChange={(event) =>
                      setBanScope(event.target.value as AccountRestriction['scope'])
                    }
                    aria-label="封禁范围"
                  >
                    {BAN_SCOPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium">处理时长</span>
                  <select
                    className={selectCls}
                    value={banValue}
                    onChange={(event) => setBanValue(event.target.value)}
                  >
                    {BAN_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {detail.user.restrictions.length > 0 && (
                  <div className="rounded-xl border border-apple-border bg-apple-bg p-3">
                    <p className="text-[13px] font-medium">当前限制</p>
                    <ul className="mt-2 space-y-2">
                      {detail.user.restrictions.map((restriction) => (
                        <li key={restriction.id} className="text-[12px] leading-relaxed">
                          <span className="font-medium">
                            {RESTRICTION_SCOPE_LABEL[restriction.scope]}
                          </span>
                          {' · '}
                          {restriction.kind === 'permanent'
                            ? '永久'
                            : `至 ${formatDateTime(restriction.ends_at)}`}
                          <p className="mt-1 text-apple-text-2">{restriction.reason}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium">角色</span>
                  <select
                    className={selectCls}
                    value={roleValue}
                    onChange={(event) => setRoleValue(event.target.value)}
                  >
                    <option value="user">用户</option>
                    <option value="staff">职员</option>
                    <option value="admin">管理员</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium">操作原因</span>
                  <input
                    className={inputCls}
                    placeholder="封禁时必填，将写入审计日志"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium">备注</span>
                  <textarea
                    className={textareaCls}
                    rows={3}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={busy}
                    onClick={() => void patch('set_status', banValue, banScope)}
                  >
                    保存状态
                  </button>
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={busy}
                    onClick={() => void patch('set_role', roleValue)}
                  >
                    保存角色
                  </button>
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={busy}
                    onClick={() => void patch('set_note', note)}
                  >
                    保存备注
                  </button>
                </div>
              </div>

              <div>
                <h2 className="mb-2 text-[14px] font-semibold">最近订单</h2>
                {detail.orders.length === 0 ? (
                  <p className="text-[13px] text-apple-text-3">暂无订单</p>
                ) : (
                  <ul className="divide-y divide-apple-hairline rounded-xl border border-apple-border">
                    {detail.orders.map((order) => (
                      <li key={order.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-[12px]">{order.order_no}</span>
                          <span className="block text-[11px] text-apple-text-3">
                            {formatDateTime(order.created_at)}
                          </span>
                        </span>
                        <span className="text-[13px] font-medium tabular-nums">
                          {formatPrice(order.payable)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h2 className="mb-2 text-[14px] font-semibold">订阅</h2>
                {detail.subscriptions.length === 0 ? (
                  <p className="text-[13px] text-apple-text-3">暂无订阅</p>
                ) : (
                  <ul className="space-y-1">
                    {detail.subscriptions.map((subscription) => (
                      <li key={subscription.id} className="text-[13px]">
                        {subscription.name ?? '已删除订阅'} · 至{' '}
                        {formatDateTime(subscription.expires_at)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h2 className="mb-2 text-[14px] font-semibold">优惠券</h2>
                {detail.coupons.length === 0 ? (
                  <p className="text-[13px] text-apple-text-3">暂无领取记录</p>
                ) : (
                  <ul className="space-y-1">
                    {detail.coupons.map((coupon) => (
                      <li key={coupon.id} className="text-[13px]">
                        <span className="font-mono">{coupon.code}</span> ·{' '}
                        {coupon.used_at ? '已使用' : '未使用'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h2 className="mb-2 text-[14px] font-semibold">操作日志</h2>
                {!detail.audit_available ? (
                  <p className="text-[13px] text-apple-danger">
                    审计表尚未就绪，请先执行迁移 040。
                  </p>
                ) : detail.audit_logs.length === 0 ? (
                  <p className="text-[13px] text-apple-text-3">暂无操作</p>
                ) : (
                  <ul className="space-y-2">
                    {detail.audit_logs.map((log) => (
                      <li key={log.id} className="rounded-xl border border-apple-border p-2.5">
                        <p className="text-[12px] font-medium">
                          {formatDateTime(log.created_at)} · {log.action}
                        </p>
                        <p className="mt-1 break-all font-mono text-[11px] text-apple-text-3">
                          {JSON.stringify(log.before_state)} → {JSON.stringify(log.after_state)}
                        </p>
                        {log.reason && (
                          <p className="mt-1 text-[12px] text-apple-text-2">{log.reason}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

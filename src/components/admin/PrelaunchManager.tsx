'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarClock, Play, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import { localInputToIso } from '@/lib/datetime';
import GlassSurface from '@/components/ui/GlassSurface';
import {
  Badge,
  EmptyRow,
  Field,
  LoadingRows,
  Notice,
  PageHeader,
  TableShell,
  btnGhost,
  btnPrimary,
  inputCls,
  selectCls,
  tdCls,
  thCls,
  type BadgeTone,
} from './ui';

type TargetType =
  | 'sub_unit'
  | 'activity'
  | 'subscription'
  | 'coupon'
  | 'home_section'
  | 'daily_pick';
type PublicationAction = 'publish' | 'unpublish';
type PublicationStatus = 'pending' | 'published' | 'failed' | 'canceled';

interface TargetOption {
  id: string;
  label: string;
  enabled: boolean;
}

interface PublicationRow {
  id: string;
  target_type: TargetType;
  target_id: string;
  action: PublicationAction;
  scheduled_at: string;
  status: PublicationStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  published_at: string | null;
}

const TARGET_LABEL: Record<TargetType, string> = {
  sub_unit: '小单元',
  activity: '活动',
  subscription: '订阅',
  coupon: '优惠券',
  home_section: '首页板块',
  daily_pick: '每日推荐',
};

const STATUS_TONE: Record<PublicationStatus, BadgeTone> = {
  pending: 'blue',
  published: 'green',
  failed: 'red',
  canceled: 'gray',
};

const STATUS_LABEL: Record<PublicationStatus, string> = {
  pending: '待执行',
  published: '已执行',
  failed: '执行失败',
  canceled: '已取消',
};

const STATUS_FILTERS: Array<'all' | PublicationStatus> = [
  'all',
  'pending',
  'published',
  'failed',
  'canceled',
];

const DEFAULT_SCHEDULE_MINUTES = 60;

function nextLocalInput(): string {
  const date = new Date(Date.now() + DEFAULT_SCHEDULE_MINUTES * 60 * 1000);
  date.setSeconds(0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  const time = Date.parse(value);
  if (Number.isNaN(time)) return '—';
  return new Date(time).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const int = (value: number) => value.toLocaleString('zh-CN');

async function readJson<T>(url: string): Promise<T> {
  const res = await adminFetch(url);
  if (!res.ok) throw new Error(await extractError(res));
  return (await res.json()) as T;
}

function targetName(type: TargetType, row: Record<string, unknown>): string {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  if (type === 'sub_unit' || type === 'subscription' || type === 'coupon') {
    return text(row.name) || '未命名内容';
  }
  return text(row.title) || '未命名内容';
}

const initialForm = {
  target_type: 'sub_unit' as TargetType,
  target_id: '',
  action: 'publish' as PublicationAction,
  scheduled_at: '',
  hide_now: true,
};

/** 后台「预上线」：把已存在的内容按时间自动发布或下架 */
export default function PrelaunchManager() {
  const [allRows, setAllRows] = useState<PublicationRow[] | null>(null);
  const [targets, setTargets] = useState<Record<TargetType, TargetOption[]>>({
    sub_unit: [],
    activity: [],
    subscription: [],
    coupon: [],
    home_section: [],
    daily_pick: [],
  });
  const [targetWarnings, setTargetWarnings] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | PublicationStatus>('all');
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const showNotice = useCallback((ok: boolean, text: string) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice({ ok, text });
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600);
  }, []);

  const loadTargets = useCallback(async () => {
    const warnings: string[] = [];
    const load = async (type: TargetType, url: string) => {
      try {
        const data = await readJson<unknown>(url);
        const list = Array.isArray(data) ? data : ((data as { items?: unknown[] }).items ?? []);
        return (list as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id),
          label: targetName(type, row),
          enabled: row.enabled !== false,
        }));
      } catch (e) {
        warnings.push(`${TARGET_LABEL[type]}：${e instanceof Error ? e.message : '加载失败'}`);
        return [];
      }
    };

    const [
      subUnits,
      activities,
      subscriptions,
      coupons,
      homeSections,
      dailyPicks,
    ] = await Promise.all([
      load('sub_unit', '/api/sub-units'),
      load('activity', '/api/activities'),
      load('subscription', '/api/subscriptions'),
      load('coupon', '/api/admin/coupons'),
      load('home_section', '/api/home-sections'),
      load('daily_pick', '/api/daily-picks'),
    ]);

    setTargets({
      sub_unit: subUnits,
      activity: activities,
      subscription: subscriptions,
      coupon: coupons,
      home_section: homeSections,
      daily_pick: dailyPicks,
    });
    setTargetWarnings(warnings);
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setAllRows(await readJson<PublicationRow[]>('/api/admin/publications'));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
      setAllRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadRows(), loadTargets()]);
  }, [loadRows, loadTargets]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      scheduled_at: prev.scheduled_at || nextLocalInput(),
      target_id: prev.target_id || targets[prev.target_type]?.[0]?.id || '',
    }));
  }, [targets]);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  const targetOptions = useMemo(() => targets[form.target_type] ?? [], [form.target_type, targets]);

  const rows = useMemo(
    () =>
      (allRows ?? []).filter((row) => statusFilter === 'all' || row.status === statusFilter),
    [allRows, statusFilter],
  );

  const targetLabel = useCallback((row: PublicationRow) => {
    const option = targets[row.target_type]?.find((item) => item.id === row.target_id);
    if (option) return option.label;
    const shortId = row.target_id.slice(0, 8);
    return `${TARGET_LABEL[row.target_type]} · ${shortId}`;
  }, [targets]);

  const stats = useMemo(() => {
    const current = allRows ?? [];
    return {
      pending: current.filter((row) => row.status === 'pending').length,
      failed: current.filter((row) => row.status === 'failed').length,
      published: current.filter((row) => row.status === 'published').length,
    };
  }, [allRows]);

  const changeTargetType = (type: TargetType) => {
    setForm((prev) => ({
      ...prev,
      target_type: type,
      target_id: targets[type]?.[0]?.id ?? '',
    }));
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!form.target_id) {
      setFormError('请选择要排期的内容');
      return;
    }
    const iso = localInputToIso(form.scheduled_at);
    if (!iso) {
      setFormError('请选择有效的执行时间');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const res = await adminFetch('/api/admin/publications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: form.target_type,
          target_id: form.target_id,
          action: form.action,
          scheduled_at: iso,
          hide_now: form.action === 'publish' && form.hide_now,
        }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      showNotice(true, '预上线任务已创建');
      setForm({ ...initialForm, scheduled_at: nextLocalInput(), hide_now: form.hide_now });
      await Promise.all([loadRows(), loadTargets()]);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const runDue = async () => {
    if (running) return;
    setRunning(true);
    try {
      const res = await adminFetch('/api/admin/publications/run', { method: 'POST' });
      if (!res.ok) throw new Error(await extractError(res));
      const data = (await res.json()) as { processed: number };
      showNotice(true, `已处理 ${data.processed} 个到期任务`);
      await Promise.all([loadRows(), loadTargets()]);
    } catch (e) {
      showNotice(false, e instanceof Error ? e.message : '执行失败');
    } finally {
      setRunning(false);
    }
  };

  const patchRow = async (row: PublicationRow, action: 'cancel' | 'retry' | 'run_now') => {
    if (busyId) return;
    setBusyId(row.id);
    try {
      const res = await adminFetch('/api/admin/publications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, action }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      showNotice(true, action === 'cancel' ? '任务已取消' : action === 'retry' ? '已重新排队' : '已立即执行');
      await Promise.all([loadRows(), loadTargets()]);
    } catch (e) {
      showNotice(false, e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusyId('');
    }
  };

  return (
    <>
      <PageHeader
        title="预上线"
        description="提前排期发布或下架内容；创建发布任务时可先隐藏，到点自动公开。"
        secondaryAction={
          <button type="button" onClick={runDue} disabled={running} className={btnGhost}>
            <Play className={`h-4 w-4 ${running ? 'animate-pulse' : ''}`} aria-hidden />
            立即执行到期任务
          </button>
        }
      />

      {loadError ? (
        <div className="rounded-card border border-[#F3C2C7] bg-[#FDF2F3] p-4 text-[13.5px] leading-relaxed text-[#810B17]">
          {loadError}
          <br />
          <span className="text-[12.5px]">请确认迁移 041 已执行，然后刷新。</span>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <GlassSurface tint="prism" radius="hero" sweep>
            <div className="p-5 md:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[14px] font-semibold text-apple-text">
                    <CalendarClock className="h-4 w-4" aria-hidden />
                    定时内容队列
                  </div>
                  <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-apple-text-2">
                    数据库每分钟自动处理到期任务；如果 pg_cron 不可用，可随时手动执行兜底。失败任务保留原因，可重试。
                  </p>
                </div>
                <div className="grid w-full max-w-sm grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-white/45 bg-white/55 p-3">
                    <p className="text-[11.5px] text-apple-text-2">待执行</p>
                    <p className="mt-1 text-[18px] font-semibold tabular-nums text-apple-text">{int(stats.pending)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/45 bg-white/55 p-3">
                    <p className="text-[11.5px] text-apple-text-2">已执行</p>
                    <p className="mt-1 text-[18px] font-semibold tabular-nums text-apple-text">{int(stats.published)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/45 bg-white/55 p-3">
                    <p className="text-[11.5px] text-apple-text-2">失败</p>
                    <p className="mt-1 text-[18px] font-semibold tabular-nums text-apple-text">{int(stats.failed)}</p>
                  </div>
                </div>
              </div>
            </div>
          </GlassSurface>

          {targetWarnings.length > 0 && (
            <div className="rounded-card border border-[#FFE1A8] bg-[#FFF9F0] p-4 text-[12.5px] leading-relaxed text-[#7A5300]">
              部分内容类型加载失败：
              <ul className="mt-1 list-disc pl-5">
                {targetWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={create} className="rounded-card border border-apple-border bg-apple-card p-5 shadow-card">
            <h2 className="text-[16px] font-semibold text-apple-text">创建排期</h2>
            <p className="mt-1 text-[12.5px] text-apple-text-2">时间按管理员浏览器时区提交，数据库保存绝对时间。</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="内容类型" required>
                <select
                  className={selectCls}
                  value={form.target_type}
                  onChange={(event) => changeTargetType(event.target.value as TargetType)}
                >
                  {(Object.keys(TARGET_LABEL) as TargetType[]).map((type) => (
                    <option key={type} value={type}>
                      {TARGET_LABEL[type]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="目标内容" required>
                <select
                  className={selectCls}
                  value={form.target_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, target_id: event.target.value }))}
                >
                  <option value="">请选择</option>
                  {targetOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.enabled ? '' : '（隐藏中）'} {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="动作" required>
                <select
                  className={selectCls}
                  value={form.action}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, action: event.target.value as PublicationAction }))
                  }
                >
                  <option value="publish">到点发布</option>
                  <option value="unpublish">到点下架</option>
                </select>
              </Field>

              <Field label="执行时间" required hint="建议避开整点高峰，减少时间误差感知。">
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={form.scheduled_at}
                  onChange={(event) => setForm((prev) => ({ ...prev, scheduled_at: event.target.value }))}
                  required
                />
              </Field>
            </div>

            {form.action === 'publish' && (
              <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-apple-hairline bg-apple-bg p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-apple-blue"
                  checked={form.hide_now}
                  onChange={(event) => setForm((prev) => ({ ...prev, hide_now: event.target.checked }))}
                />
                <span className="text-[13px] leading-relaxed text-apple-text">
                  创建后立即先隐藏，到点自动发布
                  <span className="mt-0.5 block text-[12px] text-apple-text-3">
                    适合提前上传但不想让用户看到的内容。
                  </span>
                </span>
              </label>
            )}

            {formError && (
              <p className="mt-3 rounded-xl bg-[#FDF2F3] px-3 py-2 text-[13px] text-[#810B17]">{formError}</p>
            )}

            <div className="mt-4">
              <button type="submit" disabled={saving} className={btnPrimary}>
                <RefreshCw className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} aria-hidden />
                创建任务
              </button>
            </div>
          </form>

          <section className="rounded-card border border-apple-border bg-apple-card p-5 shadow-card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold text-apple-text">任务队列</h2>
                <p className="mt-1 text-[12.5px] text-apple-text-2">失败任务会保留原因，可一键重试。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`h-8 rounded-full px-3 text-[12.5px] font-medium transition ${
                      statusFilter === status
                        ? 'bg-apple-text text-white'
                        : 'bg-apple-bg text-apple-text-2 hover:text-apple-text'
                    }`}
                  >
                    {status === 'all' ? '全部' : STATUS_LABEL[status]}
                  </button>
                ))}
              </div>
            </div>

            <TableShell>
              <thead>
                <tr>
                  <th className={thCls}>状态</th>
                  <th className={thCls}>内容</th>
                  <th className={thCls}>动作</th>
                  <th className={thCls}>执行时间</th>
                  <th className={thCls}>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LoadingRows colSpan={5} />
                ) : !rows || rows.length === 0 ? (
                  <EmptyRow colSpan={5} text="暂无预上线任务" />
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td className={tdCls}>
                        <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                        {row.status === 'failed' && row.last_error && (
                          <p className="mt-1 max-w-[220px] text-[12px] leading-relaxed text-[#810B17]">{row.last_error}</p>
                        )}
                      </td>
                      <td className={tdCls}>
                        {targetLabel(row)}
                        <p className="mt-1 text-[12px] text-apple-text-3">{TARGET_LABEL[row.target_type]}</p>
                      </td>
                      <td className={tdCls}>{row.action === 'publish' ? '发布' : '下架'}</td>
                      <td className={tdCls}>
                        {formatTime(row.scheduled_at)}
                        {row.published_at && (
                          <p className="mt-1 text-[12px] text-apple-text-3">完成于 {formatTime(row.published_at)}</p>
                        )}
                      </td>
                      <td className={tdCls}>
                        <div className="flex flex-wrap items-center gap-3">
                          {(row.status === 'pending' || row.status === 'failed') && (
                            <button
                              type="button"
                              onClick={() => patchRow(row, 'run_now')}
                              disabled={Boolean(busyId)}
                              className="text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover disabled:opacity-40"
                            >
                              立即执行
                            </button>
                          )}
                          {row.status === 'failed' && (
                            <button
                              type="button"
                              onClick={() => patchRow(row, 'retry')}
                              disabled={Boolean(busyId)}
                              className="inline-flex items-center gap-1 text-[13px] font-medium text-apple-text-2 transition hover:text-apple-text disabled:opacity-40"
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                              重试
                            </button>
                          )}
                          {row.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => patchRow(row, 'cancel')}
                              disabled={Boolean(busyId)}
                              className="inline-flex items-center gap-1 text-[13px] font-medium text-[#D70015] transition hover:opacity-80 disabled:opacity-40"
                            >
                              <XCircle className="h-3.5 w-3.5" aria-hidden />
                              取消
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </TableShell>
          </section>
        </div>
      )}

      <Notice notice={notice} />
    </>
  );
}

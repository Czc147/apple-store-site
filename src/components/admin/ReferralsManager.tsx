'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Play, RefreshCw, Save, Users } from 'lucide-react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import GlassSurface from '@/components/ui/GlassSurface';
import Modal from './Modal';
import {
  Badge,
  EmptyRow,
  Field,
  LoadingRows,
  Notice,
  PageHeader,
  TableShell,
  btnDanger,
  btnGhost,
  btnPrimary,
  inputCls,
  selectCls,
  textareaCls,
  tdCls,
  thCls,
  type BadgeTone,
} from './ui';

type InviteStatus = 'registered' | 'review' | 'rewarded' | 'rejected';

interface ReferralSettings {
  enabled: boolean;
  reward_coupon_id: string | null;
  /** 前台「当前奖励」显示的自定义文案（迁移 044）；留空 = 前台按奖励券自动拼 */
  reward_text: string | null;
  reward_delay_hours: number;
  require_first_order: boolean;
  min_order_amount: number;
  per_inviter_limit: number;
  per_device_limit: number;
  per_ip_limit: number;
  manual_review: boolean;
  updated_at: string;
}

interface CouponOption {
  id: string;
  name: string;
  type: 'fixed' | 'percent';
  value: number;
  min_amount: number;
  enabled: boolean;
}

interface InviteRow {
  id: string;
  inviter_email: string;
  invitee_email: string;
  status: InviteStatus;
  created_at: string;
  registered_at: string;
  qualified_at: string | null;
  rewarded_at: string | null;
  rejection_reason: string | null;
  risk_rule: string | null;
  review_note: string | null;
  processed_by: string | null;
  invitee_device_hash: string | null;
  invitee_ip_hash: string | null;
}

interface ReferralData {
  settings: ReferralSettings;
  coupons: CouponOption[];
  invites: InviteRow[];
  stats: { invited: number; review: number; rewarded: number; rejected: number };
  users_truncated: boolean;
}

const STATUS_LABEL: Record<InviteStatus, string> = {
  registered: '等待条件',
  review: '待审核',
  rewarded: '已发奖励',
  rejected: '已拒绝',
};

const STATUS_TONE: Record<InviteStatus, BadgeTone> = {
  registered: 'gray',
  review: 'amber',
  rewarded: 'green',
  rejected: 'red',
};

const int = (value: number) => value.toLocaleString('zh-CN');

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

function rejectionReasonText(value: string | null): string {
  switch (value) {
    case 'inviter_limit':
      return '超过推广人奖励上限';
    case 'device_limit':
      return '同设备邀请超过阈值';
    case 'ip_limit':
      return '同 IP 邀请超过阈值';
    case 'manual_reject':
      return '人工审核未通过';
    case 'referral_restriction':
      return '推广人奖励权限受限';
    case 'reward_failed':
      return '奖励发放失败';
    default:
      return value ?? '风控审核未通过';
  }
}

function maskHash(value: string | null): string {
  if (!value) return '—';
  return value.length <= 16 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function rewardLabel(coupon: CouponOption | undefined): string {
  if (!coupon) return '未配置';
  const value = coupon.type === 'percent' ? `${Number(coupon.value)}%` : `¥${Number(coupon.value).toFixed(2)}`;
  const threshold = Number(coupon.min_amount) > 0 ? ` · 满 ¥${Number(coupon.min_amount).toFixed(2)}` : '';
  return `${value}${threshold}`;
}

/** 后台「推广计划」：奖励配置、风控阈值、审核与手动兜底执行 */
export default function ReferralsManager() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [form, setForm] = useState<ReferralSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [rejectTarget, setRejectTarget] = useState<InviteRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/referrals');
      if (!res.ok) throw new Error(await extractError(res));
      const payload = (await res.json()) as ReferralData;
      setData(payload);
      setForm(payload.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setData(null);
      setForm(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const couponById = useMemo(
    () => new Map((data?.coupons ?? []).map((coupon) => [coupon.id, coupon])),
    [data?.coupons],
  );

  const update = (patch: Partial<ReferralSettings>) => {
    setForm((previous) => (previous ? { ...previous, ...patch } : previous));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || saving) return;
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/referrals', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await extractError(res));
      setNotice({ ok: true, text: '推广配置已保存' });
      await load();
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : '保存失败' });
    } finally {
      setSaving(false);
      window.setTimeout(() => setNotice(null), 2600);
    }
  };

  const run = async () => {
    if (running) return;
    setRunning(true);
    try {
      const res = await adminFetch('/api/admin/referrals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'run' }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      const payload = (await res.json()) as { processed: number };
      setNotice({ ok: true, text: `已处理 ${payload.processed} 条邀请` });
      await load();
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : '执行失败' });
    } finally {
      setRunning(false);
      window.setTimeout(() => setNotice(null), 2600);
    }
  };

  const updateInvite = async (
    id: string,
    action: 'approve' | 'reject',
    reason?: string,
  ): Promise<boolean> => {
    if (busyId) return false;
    setBusyId(id);
    try {
      const res = await adminFetch('/api/admin/referrals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, id, reason: reason ?? null }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      setNotice({ ok: true, text: action === 'approve' ? '奖励已发放' : '邀请已拒绝' });
      await load();
      return true;
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : '操作失败' });
      return false;
    } finally {
      setBusyId('');
      window.setTimeout(() => setNotice(null), 2600);
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget || busyId) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setNotice({ ok: false, text: '请填写拒绝原因' });
      window.setTimeout(() => setNotice(null), 2600);
      return;
    }
    const success = await updateInvite(rejectTarget.id, 'reject', reason);
    if (success) {
      setRejectTarget(null);
      setRejectReason('');
    }
  };

  return (
    <>
      <PageHeader
        title="推广计划"
        description="配置邀请奖励、风控阈值与人工审核，防止批量注册刷券。"
        secondaryAction={
          <>
            <button type="button" onClick={() => void run()} disabled={running} className={btnGhost}>
              <Play className={`h-4 w-4 ${running ? 'animate-pulse' : ''}`} aria-hidden />
              立即执行
            </button>
            <button type="button" onClick={() => void load()} disabled={loading} className={btnGhost}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
              刷新
            </button>
          </>
        }
      />

      {error ? (
        <div className="rounded-card border border-[#F3C2C7] bg-[#FDF2F3] p-4 text-[13.5px] leading-relaxed text-[#810B17]">
          {error}
          <br />
          <span className="text-[12.5px]">请确认迁移 042 已执行，然后刷新。</span>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <GlassSurface tint="prism" radius="hero" sweep>
            <div className="p-5 md:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[14px] font-semibold text-apple-text">
                    <Users className="h-4 w-4" aria-hidden />
                    推广脉冲
                  </div>
                  <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-apple-text-2">
                    奖励不会在注册瞬间发放；先经过风控延迟、设备与网络校验，再满足首单条件。
                  </p>
                </div>
                <div className="grid w-full max-w-lg grid-cols-2 gap-3 md:grid-cols-4">
                  {[
                    { label: '有效邀请', value: data?.stats.invited ?? 0 },
                    { label: '待审核', value: data?.stats.review ?? 0 },
                    { label: '已发奖励', value: data?.stats.rewarded ?? 0 },
                    { label: '已拒绝', value: data?.stats.rejected ?? 0 },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/45 bg-white/55 p-3">
                      <p className="text-[11.5px] text-apple-text-2">{item.label}</p>
                      <p className="mt-1 text-[18px] font-semibold tabular-nums text-apple-text">{int(item.value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </GlassSurface>

          {form && (
            <form onSubmit={save} className="rounded-card border border-apple-border bg-apple-card p-5 shadow-card">
              <h2 className="text-[16px] font-semibold text-apple-text">奖励与风控</h2>
              <p className="mt-1 text-[12.5px] text-apple-text-2">
                奖励券沿用现有优惠券体系；发放记录带推广溯源，且每个邀请只发一次。
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="奖励优惠券" required hint="建议选择低面额、低门槛、有效期较短的专用券。">
                  <select
                    value={form.reward_coupon_id ?? ''}
                    onChange={(event) => update({ reward_coupon_id: event.target.value || null })}
                    className={selectCls}
                  >
                    <option value="">请选择优惠券</option>
                    {(data?.coupons ?? []).map((coupon) => (
                      <option key={coupon.id} value={coupon.id}>
                        {coupon.name} · {rewardLabel(coupon)} {coupon.enabled ? '' : '（已停用）'}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field
                    label="奖励文案（用户看到的「当前奖励」）"
                    hint="直接写用户能看懂的一句话，例如「好友首单满 30 元后，你得一张 8 折券」。留空则由前台按上面这张券自动拼（例如「新人回馈券 · 立减 20%（满 ¥100 可用）」）。最多 120 字。"
                  >
                    <textarea
                      value={form.reward_text ?? ''}
                      onChange={(event) => update({ reward_text: event.target.value || null })}
                      maxLength={120}
                      rows={2}
                      className={textareaCls}
                      placeholder="留空 = 前台自动按奖励券拼一句"
                    />
                  </Field>
                </div>
                <Field label="奖励延迟（小时）" required hint="建议 24–72 小时，先观察账号是否异常。">
                  <input
                    type="number"
                    min={0}
                    max={720}
                    value={form.reward_delay_hours}
                    onChange={(event) => update({ reward_delay_hours: Number(event.target.value) })}
                    className={inputCls}
                  />
                </Field>
                <Field label="单个推广人奖励上限" required>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={form.per_inviter_limit}
                    onChange={(event) => update({ per_inviter_limit: Number(event.target.value) })}
                    className={inputCls}
                  />
                </Field>
                <Field label="同设备邀请上限" required hint="同一个浏览器设备指纹最多绑定几个新账号。">
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={form.per_device_limit}
                    onChange={(event) => update({ per_device_limit: Number(event.target.value) })}
                    className={inputCls}
                  />
                </Field>
                <Field label="同 IP 邀请上限" required hint="家庭网络可适度放宽，代理刷单建议收紧。">
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={form.per_ip_limit}
                    onChange={(event) => update({ per_ip_limit: Number(event.target.value) })}
                    className={inputCls}
                  />
                </Field>
                {form.require_first_order && (
                  <Field label="首单最低实付（元）" required>
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      step="0.01"
                      value={form.min_order_amount}
                      onChange={(event) => update({ min_order_amount: Number(event.target.value) })}
                      className={inputCls}
                    />
                  </Field>
                )}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {[
                  { key: 'enabled', label: '启用推广计划' },
                  { key: 'require_first_order', label: '要求被邀请人完成首笔订单' },
                  { key: 'manual_review', label: '满足条件后转人工审核' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex h-11 cursor-pointer items-center gap-3 rounded-xl border border-apple-border bg-white px-4 text-[14px] text-apple-text transition hover:bg-apple-bg"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(form[item.key as keyof ReferralSettings])}
                      onChange={(event) => update({ [item.key]: event.target.checked } as Partial<ReferralSettings>)}
                      className="h-4 w-4 accent-apple-blue"
                    />
                    {item.label}
                  </label>
                ))}
              </div>

              <div className="mt-5 flex justify-end">
                <button type="submit" disabled={saving} className={btnPrimary}>
                  <Save className="h-4 w-4" aria-hidden />
                  {saving ? '保存中…' : '保存配置'}
                </button>
              </div>
            </form>
          )}

          <section className="rounded-card border border-apple-border bg-apple-card p-5 shadow-card">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold text-apple-text">邀请记录</h2>
                <p className="mt-1 text-[12.5px] text-apple-text-2">待审核记录可人工发放或拒绝；拒绝原因会保留。</p>
              </div>
            </div>
            <TableShell>
              <thead>
                <tr>
                  <th className={thCls}>状态</th>
                  <th className={thCls}>推广人</th>
                  <th className={thCls}>被邀请人</th>
                  <th className={thCls}>时间与指纹</th>
                  <th className={thCls}>审核备注</th>
                  <th className={thCls}>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LoadingRows colSpan={6} />
                ) : !data || data.invites.length === 0 ? (
                  <EmptyRow colSpan={6} text="暂无邀请记录" />
                ) : (
                  data.invites.map((invite) => (
                    <tr key={invite.id}>
                      <td className={tdCls}>
                        <Badge tone={STATUS_TONE[invite.status]}>{STATUS_LABEL[invite.status]}</Badge>
                        {invite.risk_rule && (
                          <p className="mt-1 max-w-[220px] text-[12px] text-[#810B17]">
                            {rejectionReasonText(invite.risk_rule)}
                          </p>
                        )}
                      </td>
                      <td className={tdCls}>{invite.inviter_email}</td>
                      <td className={tdCls}>{invite.invitee_email}</td>
                      <td className={tdCls}>
                        <p>注册 {formatTime(invite.registered_at)}</p>
                        <p className="mt-1 text-[12px] text-apple-text-3">绑定 {formatTime(invite.created_at)}</p>
                        <p className="mt-1 font-mono text-[11px] text-apple-text-3">
                          设备 {maskHash(invite.invitee_device_hash)} · 网络 {maskHash(invite.invitee_ip_hash)}
                        </p>
                      </td>
                      <td className={tdCls}>
                        <p className="max-w-[260px] whitespace-pre-wrap text-[12px] leading-relaxed">
                          {invite.review_note ?? '—'}
                        </p>
                        <p className="mt-1 text-[11px] text-apple-text-3">
                          处理人 {invite.processed_by ?? '系统'}
                          {invite.qualified_at ? ` · 条件达成 ${formatTime(invite.qualified_at)}` : ''}
                          {invite.rewarded_at ? ` · 奖励 ${formatTime(invite.rewarded_at)}` : ''}
                        </p>
                      </td>
                      <td className={tdCls}>
                        <div className="flex flex-wrap gap-3">
                          {invite.status === 'review' && (
                            <button
                              type="button"
                              onClick={() => void updateInvite(invite.id, 'approve')}
                              disabled={Boolean(busyId)}
                              className="text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover disabled:opacity-40"
                            >
                              发放奖励
                            </button>
                          )}
                          {(invite.status === 'review' || invite.status === 'registered') && (
                            <button
                              type="button"
                              onClick={() => {
                                setRejectTarget(invite);
                                setRejectReason(invite.review_note ?? '');
                              }}
                              disabled={Boolean(busyId)}
                              className="text-[13px] font-medium text-[#D70015] transition hover:opacity-80 disabled:opacity-40"
                            >
                              拒绝
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

      <Modal
        open={Boolean(rejectTarget)}
        title="拒绝推广奖励"
        onClose={() => setRejectTarget(null)}
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setRejectTarget(null)}>
              取消
            </button>
            <button
              type="button"
              className={btnDanger}
              onClick={() => void confirmReject()}
              disabled={Boolean(busyId)}
            >
              {busyId ? '提交中…' : '确认拒绝'}
            </button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed text-apple-text">
          拒绝后该邀请无法获得奖励，原因会展示给推广人。
        </p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] font-medium text-apple-text">
            拒绝原因<span className="text-[#D70015]">*</span>
          </span>
          <textarea
            className={textareaCls}
            rows={3}
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="例如：邀请账号存在重复注册风险"
          />
          <span className="mt-1 block text-[12px] leading-relaxed text-apple-text-3">
            请使用用户可理解的说明，避免暴露设备指纹、IP 等具体风控细节。
          </span>
        </label>
      </Modal>

      <Notice notice={notice} />
    </>
  );
}

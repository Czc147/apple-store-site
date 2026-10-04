'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import { localInputToIso } from '@/lib/datetime';
import {
  COUPON_SCOPE,
  COUPON_SCOPE_LABEL,
  COUPON_TYPE,
  COUPON_TYPE_LABEL,
  type Coupon,
  type CouponScope,
  type CouponType,
} from '@/lib/coupon-types';
import type { Activity } from '@/lib/types';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
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

/** GET /api/admin/coupons 的列表行 */
interface CouponRowData extends Coupon {
  activity_name: string | null;
  /** 这张券被哪几条「卡券订阅」发放（迁移 033）。空数组 = 没有订阅用它 */
  used_by_subscriptions: string[];
  claimed_count: number;
  used_count: number;
  locked_count: number;
}

interface CouponRiskSettings {
  enabled: boolean;
  window_hours: number;
  device_limit: number;
  ip_limit: number;
  new_account_cooldown_hours: number;
  first_strike_hours: number;
  second_strike_days: number;
  permanent_strikes: number;
  allow_coupon_override: boolean;
}

interface FormState {
  activity_id: string;
  allowed_scopes: CouponScope[];
  name: string;
  type: CouponType;
  value: string;
  min_amount: string;
  valid_from: string;
  valid_to: string;
  /** 发券后有效天数（迁移 034）：空 = 用上面那个固定窗 */
  valid_days_after_issue: string;
  total_qty: string;
  per_user_limit: string;
  risk_override_enabled: boolean;
  risk_device_limit: string;
  risk_ip_limit: string;
  risk_new_account_cooldown_hours: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = {
  activity_id: '',
  allowed_scopes: Object.values(COUPON_SCOPE),
  name: '',
  type: COUPON_TYPE.FIXED,
  value: '',
  min_amount: '0',
  valid_from: '',
  valid_to: '',
  valid_days_after_issue: '',
  total_qty: '',
  per_user_limit: '1',
  risk_override_enabled: false,
  risk_device_limit: '',
  risk_ip_limit: '',
  risk_new_account_cooldown_hours: '',
  enabled: true,
};

/** ISO → datetime-local 输入值（本地时区） */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 活动下拉文案：优先标题，回退介绍首行 */
function activityLabel(a: Activity): string {
  const t = a.title?.trim();
  if (t) return t;
  const first = a.description?.split(/\r?\n/).find((l) => l.trim());
  return first?.trim() || '未命名活动';
}

/** 面额展示：满减「¥10」/ 折扣「10%」 */
function faceText(c: Pick<Coupon, 'type' | 'value'>): string {
  const v = Number(c.value);
  return c.type === COUPON_TYPE.PERCENT ? `${v}%` : `¥${v.toFixed(2)}`;
}

/** 券的当前状态（按时间窗与领取数判断，纯展示用） */
function stateOf(c: CouponRowData): { text: string; tone: BadgeTone } {
  if (!c.enabled) return { text: '已停用', tone: 'gray' };
  const now = Date.now();
  if (c.valid_from && now < Date.parse(c.valid_from)) return { text: '未开始', tone: 'amber' };
  if (c.valid_to && now > Date.parse(c.valid_to)) return { text: '已结束', tone: 'gray' };
  if (c.total_qty !== null && c.claimed_count >= c.total_qty) return { text: '已领完', tone: 'red' };
  return { text: '进行中', tone: 'green' };
}

/**
 * 优惠券管理（/admin/coupons）：
 * - 券挂在活动下（活动板块是用户领取入口）；列表带领取/使用统计
 * - 类型：满减（固定金额）/ 折扣（减免百分比 1–99）
 * - 一码一人：用户在活动页领取专属码，结账时输入抵扣（额度服务端现算）
 */
export default function CouponsManager() {
  const [rows, setRows] = useState<CouponRowData[] | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CouponRowData | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [riskForm, setRiskForm] = useState<CouponRiskSettings | null>(null);
  const [riskSaving, setRiskSaving] = useState(false);

  const [deleting, setDeleting] = useState<CouponRowData | null>(null);
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
      const [couponsRes, actsRes, riskRes] = await Promise.all([
        adminFetch('/api/admin/coupons'),
        adminFetch('/api/activities'),
        adminFetch('/api/admin/coupon-risk'),
      ]);
      if (!couponsRes.ok) throw new Error(await extractError(couponsRes));
      const data = (await couponsRes.json()) as { items: CouponRowData[] };
      setRows(data.items ?? []);
      if (actsRes.ok) setActivities((await actsRes.json()) as Activity[]);
      if (riskRes.ok) setRiskForm((await riskRes.json()) as CouponRiskSettings);
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
    setForm({ ...EMPTY_FORM, activity_id: activities[0]?.id ?? '' });
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (row: CouponRowData) => {
    setEditing(row);
    setForm({
      // 可空（迁移 035）：闲置券回填成空串，下拉里对应「不绑定活动」
      activity_id: row.activity_id ?? '',
      allowed_scopes: row.allowed_scopes?.length ? row.allowed_scopes : Object.values(COUPON_SCOPE),
      name: row.name,
      type: row.type,
      value: String(Number(row.value)),
      min_amount: String(Number(row.min_amount)),
      valid_from: toLocalInput(row.valid_from),
      valid_to: toLocalInput(row.valid_to),
      valid_days_after_issue:
        row.valid_days_after_issue != null ? String(row.valid_days_after_issue) : '',
      total_qty: row.total_qty === null ? '' : String(row.total_qty),
      per_user_limit: String(row.per_user_limit),
      risk_override_enabled: row.risk_override_enabled,
      risk_device_limit: row.risk_device_limit == null ? '' : String(row.risk_device_limit),
      risk_ip_limit: row.risk_ip_limit == null ? '' : String(row.risk_ip_limit),
      risk_new_account_cooldown_hours:
        row.risk_new_account_cooldown_hours == null
          ? ''
          : String(row.risk_new_account_cooldown_hours),
      enabled: row.enabled,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    // 活动从迁移 035 起可选：留空 = 闲置券（只能随订阅发放），这里不再拦
    if (!form.name.trim()) return setFormError('请填写券名称');
    if (!form.value.trim()) return setFormError('请填写面额');

    setSaving(true);
    setFormError(null);
    try {
      const body = {
        activity_id: form.activity_id,
        allowed_scopes: form.allowed_scopes,
        name: form.name.trim(),
        type: form.type,
        value: Number(form.value),
        min_amount: form.min_amount.trim() === '' ? 0 : Number(form.min_amount),
        // 提交带时区的 ISO（空 = 不限制）。与订阅折扣同一处坑，必须一起改，
        // 否则会出现"订阅折扣按北京时间、券按 UTC"的新不一致。
        valid_from: localInputToIso(form.valid_from),
        valid_to: localInputToIso(form.valid_to),
        // 发券后有效天数（迁移 034）：空 = 用上面的固定窗。填了就以**领取时刻**起算，
        // 模板的失效时间对已发出去的券不再适用（卡券订阅发券靠它，否则用户
        // 半年后买、拿到的券早过期了）。
        valid_days_after_issue:
          form.valid_days_after_issue.trim() === ''
            ? null
            : Number(form.valid_days_after_issue),
        total_qty: form.total_qty.trim() === '' ? null : Number(form.total_qty),
        per_user_limit: form.per_user_limit.trim() === '' ? 1 : Number(form.per_user_limit),
        risk_override_enabled: form.risk_override_enabled,
        risk_device_limit:
          form.risk_device_limit.trim() === '' ? null : Number(form.risk_device_limit),
        risk_ip_limit: form.risk_ip_limit.trim() === '' ? null : Number(form.risk_ip_limit),
        risk_new_account_cooldown_hours:
          form.risk_new_account_cooldown_hours.trim() === ''
            ? null
            : Number(form.risk_new_account_cooldown_hours),
        enabled: form.enabled,
      };
      const res = await adminFetch(
        editing ? `/api/admin/coupons/${editing.id}` : '/api/admin/coupons',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(await extractError(res));
      setFormOpen(false);
      showNotice(true, editing ? '已保存修改' : '已创建优惠券');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const saveRisk = async () => {
    if (!riskForm || riskSaving) return;
    setRiskSaving(true);
    try {
      const res = await adminFetch('/api/admin/coupon-risk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(riskForm),
      });
      if (!res.ok) throw new Error(await extractError(res));
      setRiskForm((await res.json()) as CouponRiskSettings);
      showNotice(true, '领券风控已保存');
    } catch (err) {
      showNotice(false, err instanceof Error ? err.message : '保存失败');
    } finally {
      setRiskSaving(false);
    }
  };

  const toggleEnabled = async (row: CouponRowData) => {
    const res = await adminFetch(`/api/admin/coupons/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activity_id: row.activity_id,
        allowed_scopes: row.allowed_scopes ?? Object.values(COUPON_SCOPE),
        name: row.name,
        type: row.type,
        value: Number(row.value),
        min_amount: Number(row.min_amount),
        valid_from: row.valid_from,
        valid_to: row.valid_to,
        total_qty: row.total_qty,
        per_user_limit: row.per_user_limit,
        // ⚠️ 必须带上：PUT 是 parseCouponInput + update(parsed.value) 的**整体替换**，
        // 见不到这个字段就会写成 null —— 点一次"停用"就把「发券后 N 天」静默清掉
        // （同一类"漏一处就丢数据"的坑，别删这一行）
        valid_days_after_issue: row.valid_days_after_issue,
        risk_override_enabled: row.risk_override_enabled,
        risk_device_limit: row.risk_device_limit,
        risk_ip_limit: row.risk_ip_limit,
        risk_new_account_cooldown_hours: row.risk_new_account_cooldown_hours,
        enabled: !row.enabled,
      }),
    });
    if (!res.ok) {
      showNotice(false, await extractError(res));
      return;
    }
    showNotice(true, row.enabled ? '已停用' : '已启用');
    await load();
  };

  const handleDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await adminFetch(`/api/admin/coupons/${deleting.id}`, { method: 'DELETE' });
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
        title="优惠券"
        description="一码一人领取制 · 全场通用：用户到活动页领专属码，结账时抵扣"
        createLabel="新建优惠券"
        onCreate={openCreate}
      />

      <section className="mb-6 rounded-card border border-apple-border bg-apple-card p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-apple-text">领券风控</h2>
            <p className="mt-1 text-[12.5px] text-apple-text-2">
              控制同设备、同 IP 与新账号领券阈值；违规后按次数冷却。
            </p>
          </div>
          <button type="button" className={btnPrimary} disabled={riskSaving} onClick={() => void saveRisk()}>
            {riskSaving ? '保存中…' : '保存风控'}
          </button>
        </div>

        {riskForm ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="统计窗口（小时）">
              <input
                className={inputCls}
                type="number"
                min={1}
                max={720}
                value={riskForm.window_hours}
                onChange={(e) => setRiskForm({ ...riskForm, window_hours: Number(e.target.value) })}
                disabled={riskSaving}
              />
            </Field>
            <Field label="同设备领取上限">
              <input
                className={inputCls}
                type="number"
                min={1}
                max={1000}
                value={riskForm.device_limit}
                onChange={(e) => setRiskForm({ ...riskForm, device_limit: Number(e.target.value) })}
                disabled={riskSaving}
              />
            </Field>
            <Field label="同 IP 领取上限">
              <input
                className={inputCls}
                type="number"
                min={1}
                max={1000}
                value={riskForm.ip_limit}
                onChange={(e) => setRiskForm({ ...riskForm, ip_limit: Number(e.target.value) })}
                disabled={riskSaving}
              />
            </Field>
            <Field label="新账号冷却（小时）">
              <input
                className={inputCls}
                type="number"
                min={0}
                max={720}
                value={riskForm.new_account_cooldown_hours}
                onChange={(e) =>
                  setRiskForm({ ...riskForm, new_account_cooldown_hours: Number(e.target.value) })
                }
                disabled={riskSaving}
              />
            </Field>
            <Field label="第 1 次违规冷却（小时）">
              <input
                className={inputCls}
                type="number"
                min={1}
                max={720}
                value={riskForm.first_strike_hours}
                onChange={(e) => setRiskForm({ ...riskForm, first_strike_hours: Number(e.target.value) })}
                disabled={riskSaving}
              />
            </Field>
            <Field label="第 2 次违规冷却（天）">
              <input
                className={inputCls}
                type="number"
                min={1}
                max={60}
                value={riskForm.second_strike_days}
                onChange={(e) => setRiskForm({ ...riskForm, second_strike_days: Number(e.target.value) })}
                disabled={riskSaving}
              />
            </Field>
            <Field label="永久封禁次数">
              <input
                className={inputCls}
                type="number"
                min={2}
                max={10}
                value={riskForm.permanent_strikes}
                onChange={(e) => setRiskForm({ ...riskForm, permanent_strikes: Number(e.target.value) })}
                disabled={riskSaving}
              />
            </Field>
            <div className="space-y-2.5 pt-6">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={riskForm.enabled}
                  onChange={(e) => setRiskForm({ ...riskForm, enabled: e.target.checked })}
                  className="h-4 w-4 accent-apple-blue"
                  disabled={riskSaving}
                />
                <span className="text-[14px] text-apple-text">启用全局风控</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={riskForm.allow_coupon_override}
                  onChange={(e) =>
                    setRiskForm({ ...riskForm, allow_coupon_override: e.target.checked })
                  }
                  className="h-4 w-4 accent-apple-blue"
                  disabled={riskSaving}
                />
                <span className="text-[14px] text-apple-text">允许单券覆盖全局阈值</span>
              </label>
            </div>
          </div>
        ) : (
          <div className="skeleton h-24 rounded-xl" />
        )}
      </section>

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
              <th className={thCls}>券名</th>
              <th className={thCls}>所属活动</th>
              <th className={thCls}>优惠</th>
              <th className={thCls}>门槛</th>
              <th className={thCls}>有效期</th>
              <th className={thCls}>领取 / 使用</th>
              <th className={thCls}>状态</th>
              <th className={thCls}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <LoadingRows colSpan={8} />
            ) : rows.length === 0 ? (
              <EmptyRow
                colSpan={8}
                text="还没有优惠券，新建后用户即可在活动页领取"
                createLabel="新建优惠券"
                onCreate={openCreate}
              />
            ) : (
              rows.map((row) => {
                const st = stateOf(row);
                return (
                  <tr key={row.id} className="transition hover:bg-apple-bg/60">
                    <td className={tdCls}>
                      <span className="font-medium">{row.name}</span>
                    </td>
                    <td className={`${tdCls} max-w-[180px]`}>
                      <span className="block truncate text-apple-text-2">
                        {row.activity_id
                          ? (row.activity_name ?? '（活动已删除）')
                          : '闲置（不绑活动）'}
                      </span>
                      {row.used_by_subscriptions.length > 0 && (
                        <span className="mt-0.5 block truncate text-[12px] text-apple-blue">
                          订阅发放：{row.used_by_subscriptions.join('、')}
                        </span>
                      )}
                      <span className="mt-0.5 block truncate text-[12px] text-apple-text-3">
                        可用于：{(row.allowed_scopes ?? Object.values(COUPON_SCOPE))
                          .map((scope) => COUPON_SCOPE_LABEL[scope])
                          .join(' / ')}
                      </span>
                    </td>
                    <td className={tdCls}>
                      <Badge tone="red">{faceText(row)}</Badge>
                      <span className="ml-1.5 text-[12px] text-apple-text-3">
                        {COUPON_TYPE_LABEL[row.type]}
                      </span>
                    </td>
                    <td className={`${tdCls} tabular-nums text-apple-text-2`}>
                      {Number(row.min_amount) > 0 ? `满 ¥${Number(row.min_amount).toFixed(2)}` : '无门槛'}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap text-[13px] text-apple-text-2`}>
                      {row.valid_from || row.valid_to
                        ? `${row.valid_from ? toLocalInput(row.valid_from).replace('T', ' ') : '—'} ~ ${
                            row.valid_to ? toLocalInput(row.valid_to).replace('T', ' ') : '—'
                          }`
                        : '长期有效'}
                    </td>
                    <td className={`${tdCls} tabular-nums`}>
                      {row.claimed_count}
                      {row.total_qty !== null && (
                        <span className="text-apple-text-3"> / {row.total_qty}</span>
                      )}
                      <span className="ml-1.5 text-[12px] text-apple-text-3">
                        （已用 {row.used_count}
                        {row.locked_count > 0 && ` · 占用 ${row.locked_count}`}）
                      </span>
                    </td>
                    <td className={tdCls}>
                      <Badge tone={st.tone}>{st.text}</Badge>
                    </td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="inline-flex items-center gap-1 text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleEnabled(row)}
                          className="text-[13px] font-medium text-apple-text-2 transition hover:text-apple-text"
                        >
                          {row.enabled ? '停用' : '启用'}
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
                );
              })
            )}
          </tbody>
        </TableShell>
      )}

      <Modal
        open={formOpen}
        title={editing ? '编辑优惠券' : '新建优惠券'}
        onClose={() => {
          if (!saving) setFormOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className={btnGhost}
              onClick={() => setFormOpen(false)}
              disabled={saving}
            >
              取消
            </button>
            <button type="submit" form="coupon-form" className={btnPrimary} disabled={saving}>
              {saving ? '保存中…' : editing ? '保存' : '创建'}
            </button>
          </>
        }
      >
        <form id="coupon-form" onSubmit={handleSave} className="space-y-4">
          <Field
            label="所属活动"
            hint="绑了活动 = 用户能在活动页领到它；留空 = 闲置券，只在「卡券订阅」里发放（给订阅用户的专属券就用这个）"
          >
            <select
              className={selectCls}
              value={form.activity_id}
              onChange={(e) => setForm((f) => ({ ...f, activity_id: e.target.value }))}
              disabled={saving}
            >
              <option value="">不绑定活动（闲置券）</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {activityLabel(a)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="可使用范围" required hint="勾选后该券才能用于对应订单；活动不是使用范围">
            <div className="flex gap-4">
              {Object.values(COUPON_SCOPE).map((scope) => (
                <label key={scope} className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={form.allowed_scopes.includes(scope)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        allowed_scopes: e.target.checked
                          ? [...f.allowed_scopes, scope]
                          : f.allowed_scopes.filter((x) => x !== scope),
                      }))
                    }
                    disabled={saving}
                  />
                  <span className="text-sm text-apple-text">{COUPON_SCOPE_LABEL[scope]}</span>
                </label>
              ))}
            </div>
          </Field>

          <Field label="券名称" required hint="用户看到的名称，如「新客立减 10 元」">
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              maxLength={60}
              placeholder="新客立减 10 元"
              disabled={saving}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="类型" required>
              <select
                className={selectCls}
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CouponType }))}
                disabled={saving}
              >
                <option value={COUPON_TYPE.FIXED}>满减（减固定金额）</option>
                <option value={COUPON_TYPE.PERCENT}>折扣（减百分比）</option>
              </select>
            </Field>
            <Field
              label={form.type === COUPON_TYPE.PERCENT ? '减免百分比' : '减免金额（元）'}
              required
              hint={form.type === COUPON_TYPE.PERCENT ? '1–99，如 20 = 减 20%' : '如 10 = 减 10 元'}
            >
              <input
                className={inputCls}
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                inputMode="decimal"
                placeholder={form.type === COUPON_TYPE.PERCENT ? '20' : '10'}
                disabled={saving}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="用券门槛（元）" hint="订单原价需 ≥ 该金额；0 = 无门槛">
              <input
                className={inputCls}
                value={form.min_amount}
                onChange={(e) => setForm((f) => ({ ...f, min_amount: e.target.value }))}
                inputMode="decimal"
                placeholder="0"
                disabled={saving}
              />
            </Field>
            <Field label="每人限领" hint="默认 1 张（一码一人）">
              <input
                className={inputCls}
                value={form.per_user_limit}
                onChange={(e) => setForm((f) => ({ ...f, per_user_limit: e.target.value }))}
                inputMode="numeric"
                placeholder="1"
                disabled={saving}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="生效时间" hint="留空 = 立即生效">
              <input
                type="datetime-local"
                className={inputCls}
                value={form.valid_from}
                onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
                disabled={saving}
              />
            </Field>
            <Field label="失效时间" hint="留空 = 长期有效">
              <input
                type="datetime-local"
                className={inputCls}
                value={form.valid_to}
                onChange={(e) => setForm((f) => ({ ...f, valid_to: e.target.value }))}
                disabled={saving}
              />
            </Field>
          </div>

          {/* 发券后有效天数（迁移 034）：与上面的固定时间窗**二选一**。
              卡券订阅发的券要用它 —— 否则用户半年后买，拿到的券早就过期了。 */}
          <Field
            label="发券后有效天数"
            hint="填了就按「发到手上那天起算 N 天」；留空则用上面的固定生效/失效时间。卡券订阅发的券建议用这个"
          >
            <input
              className={inputCls}
              type="number"
              min={1}
              max={3650}
              step={1}
              inputMode="numeric"
              placeholder="留空 = 用上面的固定日期"
              value={form.valid_days_after_issue}
              onChange={(e) =>
                setForm((f) => ({ ...f, valid_days_after_issue: e.target.value }))
              }
              disabled={saving}
            />
          </Field>

          <Field label="总张数" hint="领完即止；留空 = 不限量">
            <input
              className={inputCls}
              value={form.total_qty}
              onChange={(e) => setForm((f) => ({ ...f, total_qty: e.target.value }))}
              inputMode="numeric"
              placeholder="不限量"
              disabled={saving}
            />
          </Field>

          <div className="rounded-xl border border-apple-border bg-apple-bg/50 p-3.5">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={form.risk_override_enabled}
                onChange={(e) => setForm((f) => ({ ...f, risk_override_enabled: e.target.checked }))}
                className="h-4 w-4 accent-apple-blue"
                disabled={saving || !riskForm?.allow_coupon_override}
              />
              <span className="text-[14px] text-apple-text">
                覆盖全局领券风控{riskForm && !riskForm.allow_coupon_override ? '（未开放）' : ''}
              </span>
            </label>
            {form.risk_override_enabled && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="设备上限">
                  <input
                    className={inputCls}
                    value={form.risk_device_limit}
                    onChange={(e) => setForm((f) => ({ ...f, risk_device_limit: e.target.value }))}
                    inputMode="numeric"
                    placeholder="留空 = 全局"
                    disabled={saving}
                  />
                </Field>
                <Field label="IP 上限">
                  <input
                    className={inputCls}
                    value={form.risk_ip_limit}
                    onChange={(e) => setForm((f) => ({ ...f, risk_ip_limit: e.target.value }))}
                    inputMode="numeric"
                    placeholder="留空 = 全局"
                    disabled={saving}
                  />
                </Field>
                <Field label="新账号冷却（小时）">
                  <input
                    className={inputCls}
                    value={form.risk_new_account_cooldown_hours}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        risk_new_account_cooldown_hours: e.target.value,
                      }))
                    }
                    inputMode="numeric"
                    placeholder="留空 = 全局"
                    disabled={saving}
                  />
                </Field>
              </div>
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="h-4 w-4 accent-apple-blue"
              disabled={saving}
            />
            <span className="text-[14px] text-apple-text">启用（关闭后用户看不到也领不到）</span>
          </label>

          <p className="rounded-lg bg-apple-bg/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-apple-text-2">
            券对全场商品通用（含订阅）；结账时服务端按订单现价重算优惠，优惠后实付为 0
            的订单会被拒绝（没有可扫的收款金额）。
          </p>

          {formError && (
            <p className="text-[13px] text-[#D70015]" role="alert">
              {formError}
            </p>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="删除优惠券"
        message={
          deleting
            ? `确定要删除「${deleting.name}」吗？已领取的 ${deleting.claimed_count} 张专属码会一并失效（已用过的订单不受影响）。`
            : ''
        }
        note="删除后用户无法再领取，已领未用的码也会失效，请谨慎操作。"
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

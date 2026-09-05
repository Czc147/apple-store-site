'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import type { Activity, MajorUnit, SubUnit, Subscription } from '@/lib/types';
import { TARGET_TYPE_LABEL, type CardTargetType, type RedeemType } from '@/lib/card-types';
import { Field, Notice, inputCls, textareaCls, selectCls, btnPrimary, btnGhost } from '../ui';
import { productLabel, type CardProductRow } from './shared';

interface FormState {
  target_type: CardTargetType;
  target_id: string;
  description: string;
  /** 兑换类型：兑换内容 / 解锁每日计划（迁移 005） */
  redeem_type: RedeemType;
  /** 解锁有效天数（仅解锁每日计划生效）；空串 = 永久 */
  unlock_duration_days: string;
  sort_order: string;
  enabled: boolean;
}

/** GET /api/card-management/products/:id 响应（含库存统计与关联名称） */
type ProductDetail = CardProductRow & {
  stats: { total: number; unused: number; issued: number; void: number };
};

/** 活动下拉选项文案：优先标题，回退介绍首行 */
function activityLabel(a: Activity): string {
  if (a.title && a.title.trim()) return a.title.trim();
  const firstLine = a.description?.split(/\r?\n/).find((l) => l.trim());
  return firstLine?.trim() || '未命名活动';
}

/**
 * 新建 / 编辑卡密商品（多态关联：小单元 / 活动 / 订阅三选一）：
 * - 关联对象下拉随类型联动：小单元按大单元分组、活动、订阅
 * - 已被其它卡密商品关联的对象会禁用并标注（一个对象至多一个卡密商品）
 * - 编辑模式额外展示库存统计与「查看卡密 / 批量导入」快捷入口
 */
export default function CardProductForm({
  mode,
  id,
}: {
  mode: 'create' | 'edit';
  id?: string;
}) {
  const router = useRouter();
  const isEdit = mode === 'edit';

  const [subs, setSubs] = useState<SubUnit[]>([]);
  const [majors, setMajors] = useState<MajorUnit[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [plans, setPlans] = useState<Subscription[]>([]);
  /** 已被其它卡密商品关联的对象集合：`${target_type}:${target_id}`（编辑时排除自身） */
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ProductDetail | null>(null);

  const [form, setForm] = useState<FormState>({
    target_type: 'sub_unit',
    target_id: '',
    description: '',
    redeem_type: 'content',
    unlock_duration_days: '',
    sort_order: '0',
    enabled: true,
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [subsRes, majorsRes, actsRes, plansRes, productsRes] = await Promise.all([
        adminFetch('/api/sub-units'),
        adminFetch('/api/major-units'),
        adminFetch('/api/activities'),
        adminFetch('/api/subscriptions'),
        adminFetch('/api/card-management/products'),
      ]);
      if (!subsRes.ok) throw new Error(await extractError(subsRes));
      if (!majorsRes.ok) throw new Error(await extractError(majorsRes));
      if (!actsRes.ok) throw new Error(await extractError(actsRes));
      if (!plansRes.ok) throw new Error(await extractError(plansRes));
      if (!productsRes.ok) throw new Error(await extractError(productsRes));

      setSubs((await subsRes.json()) as SubUnit[]);
      setMajors((await majorsRes.json()) as MajorUnit[]);
      setActivities((await actsRes.json()) as Activity[]);
      setPlans((await plansRes.json()) as Subscription[]);

      const products = (await productsRes.json()) as CardProductRow[];
      setLinked(
        new Set(
          products
            .filter((p) => p.id !== id && p.target_type && p.target_id)
            .map((p) => `${p.target_type}:${p.target_id}`),
        ),
      );

      // 编辑模式：载入商品详情填充表单
      if (isEdit && id) {
        const detailRes = await adminFetch(`/api/card-management/products/${id}`);
        if (!detailRes.ok) throw new Error(await extractError(detailRes));
        const d = (await detailRes.json()) as ProductDetail;
        setDetail(d);
        setForm({
          // 关联目标被删除后两列为 null，此时默认回到小单元类型让管理员重新关联
          target_type: d.target_type ?? 'sub_unit',
          target_id: d.target_id ?? '',
          description: d.description ?? '',
          // 旧数据可能无这两列：兜底为「兑换内容 / 永久」
          redeem_type: (d.redeem_type as RedeemType) ?? 'content',
          unlock_duration_days:
            typeof d.unlock_duration_days === 'number'
              ? String(d.unlock_duration_days)
              : '',
          sort_order: String(d.sort_order),
          enabled: d.enabled,
        });
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
    }
  }, [id, isEdit]);

  useEffect(() => {
    void load();
  }, [load]);

  const isTaken = (type: CardTargetType, targetId: string) =>
    linked.has(`${type}:${targetId}`);

  const majorName = (mid: string) => majors.find((m) => m.id === mid)?.name ?? '未分组';

  /** 小单元下拉选项按大单元分组，保持接口返回顺序 */
  const groupedOptions = (() => {
    const groups: Array<{ name: string; items: SubUnit[] }> = [];
    for (const s of subs) {
      const name = majorName(s.major_unit_id);
      const g = groups.find((x) => x.name === name);
      if (g) g.items.push(s);
      else groups.push({ name, items: [s] });
    }
    return groups;
  })();

  const typeLabel = TARGET_TYPE_LABEL[form.target_type];

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.target_id) return setFormError(`请选择关联${typeLabel}`);
    const sortOrder = Number(form.sort_order);
    if (!Number.isFinite(sortOrder)) return setFormError('排序必须是数字');

    // 解锁每日计划：校验有效天数（留空 = 永久；否则必须为正整数）
    const isUnlock = form.redeem_type === 'unlock_daily';
    const durationRaw = form.unlock_duration_days.trim();
    let durationValue: number | null = null;
    if (isUnlock && durationRaw !== '') {
      const n = Number(durationRaw);
      if (!Number.isInteger(n) || n <= 0) {
        return setFormError('有效天数必须是正整数（留空即永久有效）');
      }
      durationValue = n;
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await adminFetch(
        isEdit ? `/api/card-management/products/${id}` : '/api/card-management/products',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_type: form.target_type,
            target_id: form.target_id,
            description: form.description,
            redeem_type: form.redeem_type,
            // 非解锁类型统一提交 null，避免给 content 商品留脏字段
            unlock_duration_days: isUnlock ? durationValue : null,
            sort_order: sortOrder,
            enabled: form.enabled,
          }),
        },
      );
      if (!res.ok) throw new Error(await extractError(res));
      setNotice({ ok: true, text: isEdit ? '已保存修改' : '已创建卡密商品' });
      // 短暂展示成功提示后回到列表页
      window.setTimeout(() => router.push('/admin/card-management/products'), 600);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="rounded-card border border-apple-border bg-apple-card p-6 text-center shadow-card">
        <p className="text-[14px] leading-relaxed text-apple-text-2">{loadError}</p>
        <button type="button" onClick={() => void load()} className={`${btnGhost} mt-4`}>
          重试
        </button>
      </div>
    );
  }

  return (
    <>
      <Link
        href="/admin/card-management/products"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-apple-text-2 transition hover:text-apple-text"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        返回卡密商品列表
      </Link>

      <header className="mb-5">
        <h1 className="text-[22px] font-bold leading-tight text-apple-text">
          {isEdit ? '编辑卡密商品' : '新建卡密商品'}
        </h1>
        <p className="mt-1 text-[13px] text-apple-text-2">
          {isEdit && detail
            ? `当前商品：${productLabel(detail)}`
            : '选择一个对象（小单元 / 活动 / 订阅）建立 1:1 关联，之后即可导入卡密、登记取卡'}
        </p>
      </header>

      {/* 编辑模式：库存统计 + 快捷入口 */}
      {isEdit && detail && (
        <div className="mb-5 rounded-card border border-apple-border bg-apple-card p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <p className="text-[12px] text-apple-text-3">卡密总数</p>
              <p className="text-[20px] font-bold tabular-nums">{detail.stats.total}</p>
            </div>
            <div>
              <p className="text-[12px] text-apple-text-3">未使用</p>
              <p className="text-[20px] font-bold tabular-nums text-[#1B7F3B]">
                {detail.stats.unused}
              </p>
            </div>
            <div>
              <p className="text-[12px] text-apple-text-3">已发放</p>
              <p className="text-[20px] font-bold tabular-nums text-apple-blue">
                {detail.stats.issued}
              </p>
            </div>
            <div>
              <p className="text-[12px] text-apple-text-3">已作废</p>
              <p className="text-[20px] font-bold tabular-nums text-apple-text-3">
                {detail.stats.void}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-apple-hairline pt-4">
            <Link
              href={`/admin/card-management/keys?product=${detail.id}`}
              className={btnGhost}
            >
              查看卡密
            </Link>
            <Link
              href={`/admin/card-management/keys/import?product=${detail.id}`}
              className={btnGhost}
            >
              批量导入
            </Link>
            <Link href="/admin/card-management/deliveries" className={btnGhost}>
              登记取卡
            </Link>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="max-w-xl space-y-4 rounded-card border border-apple-border bg-apple-card p-6 shadow-card"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="关联类型" required hint="卡密商品可挂在三类商品下">
            <select
              className={selectCls}
              value={form.target_type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  target_type: e.target.value as CardTargetType,
                  target_id: '',
                }))
              }
              disabled={saving}
            >
              <option value="sub_unit">小单元</option>
              <option value="activity">活动</option>
              <option value="subscription">订阅</option>
            </select>
          </Field>

          <Field
            label={`关联${typeLabel}`}
            required
            hint={
              form.target_type === 'sub_unit'
                ? subs.length === 0
                  ? '暂无可选小单元，请先在「小单元管理」中创建'
                  : '一个对象只能关联一个卡密商品；已关联的选项会被禁用'
                : form.target_type === 'activity'
                  ? activities.length === 0
                    ? '暂无可选活动，请先在「活动管理」中创建'
                    : '一个对象只能关联一个卡密商品；已关联的选项会被禁用'
                  : plans.length === 0
                    ? '暂无可选订阅，请先在「订阅管理」中创建'
                    : '一个对象只能关联一个卡密商品；已关联的选项会被禁用'
            }
          >
            {form.target_type === 'sub_unit' ? (
              <select
                className={selectCls}
                value={form.target_id}
                onChange={(e) => setForm((f) => ({ ...f, target_id: e.target.value }))}
                disabled={saving}
              >
                <option value="">请选择…</option>
                {groupedOptions.map((group) => (
                  <optgroup key={group.name} label={group.name}>
                    {group.items.map((s) => {
                      const taken = isTaken('sub_unit', s.id);
                      return (
                        <option key={s.id} value={s.id} disabled={taken}>
                          {s.name}
                          {taken ? '（已关联其它卡密商品）' : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>
            ) : form.target_type === 'activity' ? (
              <select
                className={selectCls}
                value={form.target_id}
                onChange={(e) => setForm((f) => ({ ...f, target_id: e.target.value }))}
                disabled={saving}
              >
                <option value="">请选择…</option>
                {activities.map((a) => {
                  const taken = isTaken('activity', a.id);
                  return (
                    <option key={a.id} value={a.id} disabled={taken}>
                      {activityLabel(a)}
                      {taken ? '（已关联其它卡密商品）' : ''}
                    </option>
                  );
                })}
              </select>
            ) : (
              <select
                className={selectCls}
                value={form.target_id}
                onChange={(e) => setForm((f) => ({ ...f, target_id: e.target.value }))}
                disabled={saving}
              >
                <option value="">请选择…</option>
                {plans.map((p) => {
                  const taken = isTaken('subscription', p.id);
                  return (
                    <option key={p.id} value={p.id} disabled={taken}>
                      {p.name}
                      {taken ? '（已关联其它卡密商品）' : ''}
                    </option>
                  );
                })}
              </select>
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="兑换类型"
            hint="兑换内容 = 核销后展示商品；解锁每日计划 = 核销后解锁每日推荐"
          >
            <select
              className={selectCls}
              value={form.redeem_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, redeem_type: e.target.value as RedeemType }))
              }
              disabled={saving}
            >
              <option value="content">兑换内容</option>
              <option value="unlock_daily">解锁每日计划</option>
            </select>
          </Field>

          {form.redeem_type === 'unlock_daily' && (
            <Field
              label="有效天数"
              hint="解锁有效期，自核销时刻起算；留空即永久有效"
            >
              <input
                className={inputCls}
                value={form.unlock_duration_days}
                onChange={(e) =>
                  setForm((f) => ({ ...f, unlock_duration_days: e.target.value }))
                }
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                placeholder="留空 = 永久"
                disabled={saving}
              />
            </Field>
          )}
        </div>

        <Field label="商品描述" hint="可展示在买家取卡页，帮助买家确认商品内容；选填">
          <textarea
            className={textareaCls}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="如：Zorvin 会员月卡，激活后 30 天有效"
            rows={3}
            maxLength={500}
            disabled={saving}
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
            disabled={saving}
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            className="mt-0.5 h-4 w-4 accent-apple-blue"
            disabled={saving}
          />
          <span className="text-[14px] leading-relaxed text-apple-text">
            启用该商品
            <span className="block text-[12px] text-apple-text-3">
              禁用后不可登记取卡、不发放卡密；库存数据仍会保留
            </span>
          </span>
        </label>

        {formError && (
          <p className="text-[13px] text-[#D70015]" role="alert">
            {formError}
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? '保存中…' : isEdit ? '保存修改' : '创建商品'}
          </button>
          <button
            type="button"
            className={btnGhost}
            onClick={() => router.push('/admin/card-management/products')}
            disabled={saving}
          >
            取消
          </button>
        </div>
      </form>

      <Notice notice={notice} />
    </>
  );
}

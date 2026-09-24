'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  CARD_STYLE_LABEL,
  DISCOUNT_SCOPE,
  DISCOUNT_SCOPE_LABEL,
  SUBSCRIPTION_TYPE,
  SUBSCRIPTION_TYPE_LABEL,
  type CardStyle,
  type DiscountScope,
  type Subscription,
  type SubscriptionType,
} from '@/lib/types';
import { formatPrice, toNumber } from '@/lib/format';
import { localInputToIso } from '@/lib/datetime';
import {
  couponThresholdText,
  couponValueText,
  type CouponType,
} from '@/lib/coupon-types';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import FileUploader from './FileUploader';
import {
  Field,
  PageHeader,
  TableShell,
  Thumb,
  LinkCell,
  LoadingRows,
  EmptyRow,
  RowActions,
  Notice,
  Badge,
  inputCls,
  textareaCls,
  selectCls,
  btnPrimary,
  btnGhost,
  thCls,
  tdCls,
} from './ui';

/**
 * ISO 时间 → `<input type="datetime-local">` 需要的本地时间串（YYYY-MM-DDTHH:mm）。
 * 直接 slice ISO 会得到 UTC 值，比用户本地时间差几个时区，回显会看着像"填错了"。
 */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

interface FormState {
  name: string;
  price: string;
  duration: string;
  description: string;
  link_url: string;
  redeem_image_url: string;
  type: SubscriptionType;
  unlock_duration_days: string;
  sort_order: string;
  /** 会员卡与 VIP 折扣（迁移 023） */
  card_style: '' | CardStyle;
  card_text: string;
  discount_percent: string;
  discount_scope: DiscountScope[];
  discount_valid_from: string;
  discount_valid_to: string;
  /** 高级设置（迁移 036）：纯展示字段 */
  badge_text: string;
  benefits: string[];
  terms_text: string;
  is_featured: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  price: '0',
  duration: '',
  description: '',
  link_url: '',
  redeem_image_url: '',
  type: 'normal',
  unlock_duration_days: '',
  sort_order: '0',
  card_style: '',
  card_text: '',
  discount_percent: '',
  discount_scope: [],
  discount_valid_from: '',
  discount_valid_to: '',
  badge_text: '',
  benefits: [],
  terms_text: '',
  is_featured: false,
};

/**
 * 「加入券」券库里的一项（GET /api/admin/coupons 的 items 元素，只取用得到的字段）。
 * 该接口返回的是 `{ items }`，每项是券行 + activity_name + claimed_count 等统计。
 */
interface AdminCouponOption {
  id: string;
  name: string;
  type: CouponType;
  value: number | string;
  min_amount: number | string;
  valid_from: string | null;
  valid_to: string | null;
  enabled: boolean;
}

/** 订阅管理：名称 + 价格 + 时长徽章文案 */
export default function SubscriptionsManager() {
  const [rows, setRows] = useState<Subscription[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // —— 卡券订阅「加入券」（迁移 033）——
  /** 券库：只在选中卡券订阅时懒加载一次 */
  const [couponLib, setCouponLib] = useState<AdminCouponOption[] | null>(null);
  /** 已加入的券 id，**顺序即展示顺序** */
  const [selectedCouponIds, setSelectedCouponIds] = useState<string[]>([]);
  const [couponQuery, setCouponQuery] = useState('');

  const [deleting, setDeleting] = useState<Subscription | null>(null);
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
      const res = await adminFetch('/api/subscriptions');
      if (!res.ok) throw new Error(await extractError(res));
      setRows(((await res.json()) as Subscription[]).map((s) => ({
        ...s,
        price: toNumber(s.price),
      })));
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

  // 「加入券」的券库：选中卡券订阅时才拉，拉过一次就留着（券库变动不频繁）
  useEffect(() => {
    if (!modalOpen || form.type !== SUBSCRIPTION_TYPE.COUPON || couponLib !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await adminFetch('/api/admin/coupons');
        if (!res.ok) return;
        const data = (await res.json()) as { items?: AdminCouponOption[] };
        if (!cancelled) setCouponLib(Array.isArray(data.items) ? data.items : []);
      } catch {
        /* 静默：券库拉不到不影响表单其它字段 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, form.type, couponLib]);

  // 编辑卡券订阅时回填「已加入的券」：列表接口不带券关联，单独拉一次详情
  useEffect(() => {
    if (!modalOpen || !editing || form.type !== SUBSCRIPTION_TYPE.COUPON) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await adminFetch(`/api/subscriptions/${editing.id}`);
        if (!res.ok) return;
        const data = (await res.json()) as { coupon_ids?: string[] };
        if (!cancelled) {
          setSelectedCouponIds(Array.isArray(data.coupon_ids) ? data.coupon_ids : []);
        }
      } catch {
        /* 静默 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, editing, form.type]);

  const couponById = useMemo(() => {
    const m = new Map<string, AdminCouponOption>();
    for (const c of couponLib ?? []) m.set(c.id, c);
    return m;
  }, [couponLib]);

  /** 券库里**还没被加入**的券，按搜索词过滤 */
  const couponCandidates = useMemo(() => {
    const q = couponQuery.trim().toLowerCase();
    return (couponLib ?? []).filter(
      (c) =>
        !selectedCouponIds.includes(c.id) &&
        (q === '' || c.name.toLowerCase().includes(q)),
    );
  }, [couponLib, selectedCouponIds, couponQuery]);

  const addCoupon = (id: string) =>
    setSelectedCouponIds((prev) => (prev.includes(id) ? prev : [...prev, id]));

  const removeCoupon = (id: string) =>
    setSelectedCouponIds((prev) => prev.filter((x) => x !== id));

  /** 上移/下移一位：**顺序决定发放顺序与用户看到的顺序** */
  const moveCoupon = (index: number, delta: number) =>
    setSelectedCouponIds((prev) => {
      const next = [...prev];
      const to = index + delta;
      if (to < 0 || to >= next.length) return prev;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  // —— 权益清单（迁移 036）：可增删的条目列表 ——
  const addBenefit = () =>
    setForm((f) => ({ ...f, benefits: [...f.benefits, ''] }));
  const setBenefit = (i: number, v: string) =>
    setForm((f) => ({
      ...f,
      benefits: f.benefits.map((b, idx) => (idx === i ? v : b)),
    }));
  const removeBenefit = (i: number) =>
    setForm((f) => ({ ...f, benefits: f.benefits.filter((_, idx) => idx !== i) }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    // 券关联是订阅级的，新建时还没有 id —— 清空，保存后再回来加
    setSelectedCouponIds([]);
    setCouponQuery('');
    setModalOpen(true);
  };

  const openEdit = (row: Subscription) => {
    setEditing(row);
    setForm({
      name: row.name,
      price: String(row.price),
      duration: row.duration ?? '',
      description: row.description ?? '',
      link_url: row.link_url ?? '',
      redeem_image_url: row.redeem_image_url ?? '',
      type: row.type ?? 'normal',
      unlock_duration_days:
        row.unlock_duration_days != null
          ? String(row.unlock_duration_days)
          : '',
      sort_order: String(row.sort_order),
      card_style: row.card_style ?? '',
      card_text: row.card_text ?? '',
      discount_percent: row.discount_percent != null ? String(row.discount_percent) : '',
      discount_scope: row.discount_scope ?? [],
      discount_valid_from: toLocalInput(row.discount_valid_from),
      discount_valid_to: toLocalInput(row.discount_valid_to),
      // 高级设置（迁移 036）
      badge_text: row.badge_text ?? '',
      benefits: Array.isArray(row.benefits)
        ? row.benefits.filter((b): b is string => typeof b === 'string')
        : [],
      terms_text: row.terms_text ?? '',
      is_featured: row.is_featured === true,
    });
    setFormError(null);
    // 券关联由上面那个 effect 按订阅 id 拉回来填；先清空，避免串到上一条订阅
    setSelectedCouponIds([]);
    setCouponQuery('');
    setModalOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const name = form.name.trim();
    if (!name) return setFormError('请填写订阅名称');
    const price = Math.round(toNumber(form.price) * 100) / 100;
    if (!Number.isFinite(price) || price < 0) return setFormError('价格必须是有效数字');
    const sortOrder = Number(form.sort_order);
    if (!Number.isFinite(sortOrder)) return setFormError('排序必须是数字');

    const isDaily = form.type === 'daily_plan';
    const durationRaw = form.unlock_duration_days.trim();
    let durationValue: number | null = null;
    if (isDaily && durationRaw !== '') {
      const n = Number(durationRaw);
      if (!Number.isInteger(n) || n <= 0) {
        return setFormError('有效天数必须是正整数（留空即永久有效）');
      }
      durationValue = n;
    }

    // 会员卡与折扣（迁移 023）。服务端还会再校验一遍（lib/vip-benefits.ts 的 parse*），
    // 这里先做即时反馈，避免白跑一次请求。
    const percentRaw = form.discount_percent.trim();
    let percentValue: number | null = null;
    if (percentRaw !== '') {
      const n = Number(percentRaw);
      if (!Number.isFinite(n) || n <= 0 || n >= 100) {
        return setFormError('折扣需在 0 到 100 之间（填 20 即打 8 折）');
      }
      percentValue = Math.round(n * 100) / 100;
    }
    if (percentValue !== null && form.discount_scope.length === 0) {
      return setFormError('填了折扣就要选至少一个适用范围');
    }
    if (
      form.discount_valid_from &&
      form.discount_valid_to &&
      form.discount_valid_to <= form.discount_valid_from
    ) {
      return setFormError('优惠结束时间要晚于开始时间');
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await adminFetch(
        editing ? `/api/subscriptions/${editing.id}` : '/api/subscriptions',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            price,
            duration: form.duration.trim() || null,
            description: form.description.trim() || null,
            link_url: form.link_url.trim() || null,
            redeem_image_url: form.redeem_image_url.trim() || null,
            type: form.type,
            unlock_duration_days: isDaily ? durationValue : null,
            sort_order: sortOrder,
            // 空串一律转 null，服务端按「未提供 = 不动，null = 清空」处理
            card_style: form.card_style || null,
            card_text: form.card_text.trim() || null,
            discount_percent: percentValue,
            discount_scope: form.discount_scope,
            // 提交带时区的 ISO（空 = 不限制）：服务端就不必猜时区，
            // 也不会再出现"北京时间 10:00 被存成 18:00、折扣晚 8 小时生效"
            discount_valid_from: localInputToIso(form.discount_valid_from),
            discount_valid_to: localInputToIso(form.discount_valid_to),
            // 高级设置（迁移 036）：纯展示字段；空串一律转 null，欠好过留空字符串
            badge_text: form.badge_text.trim() || null,
            benefits: form.benefits.map((b) => b.trim()).filter(Boolean),
            terms_text: form.terms_text.trim() || null,
            is_featured: form.is_featured,
            // 卡券订阅的券关联（迁移 033）：**整体替换**，数组顺序即发放顺序。
            // 只在编辑时提交 —— 新建还没有订阅 id，PUT 才认这个字段
            //（新建流程：先保存，再回来「加入券」）。
            ...(editing && form.type === SUBSCRIPTION_TYPE.COUPON
              ? { coupon_ids: selectedCouponIds }
              : {}),
          }),
        },
      );
      if (!res.ok) throw new Error(await extractError(res));
      setModalOpen(false);
      showNotice(true, editing ? '已保存修改' : '已新增订阅');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await adminFetch(`/api/subscriptions/${deleting.id}`, {
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

  // 已存在「每日计划」订阅时禁止再新建（编辑每日计划本身不受影响）
  const dailyPlanTaken =
    rows?.some((r) => r.type === 'daily_plan' && r.id !== editing?.id) ?? false;

  return (
    <>
      <PageHeader
        title="订阅管理"
        description="管理「订阅」页的套餐卡片，前台按排序值升序展示"
        createLabel="新增订阅"
        onCreate={openCreate}
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
              <th className={thCls}>排序</th>
              <th className={thCls}>名称</th>
              <th className={thCls}>类型</th>
              <th className={thCls}>价格</th>
              <th className={thCls}>时长</th>
              <th className={thCls}>跳转链接</th>
              <th className={thCls}>兑换商品</th>
              <th className={thCls}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <LoadingRows colSpan={8} />
            ) : rows.length === 0 ? (
              <EmptyRow
                colSpan={8}
                text="还没有订阅套餐，新增后前台订阅页即可展示"
                createLabel="新增订阅"
                onCreate={openCreate}
              />
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-apple-bg/60">
                  <td className={tdCls}>{row.sort_order}</td>
                  <td className={`${tdCls} font-medium`}>{row.name}</td>
                  <td className={tdCls}>
                    {row.type === 'daily_plan' ? (
                      <Badge tone="blue">{SUBSCRIPTION_TYPE_LABEL.daily_plan}</Badge>
                    ) : (
                      <Badge tone="gray">{SUBSCRIPTION_TYPE_LABEL.normal}</Badge>
                    )}
                  </td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    {formatPrice(row.price)}
                  </td>
                  <td className={tdCls}>
                    {row.duration ? (
                      <span className="rounded-full bg-apple-blue-soft px-2.5 py-1 text-[12px] font-medium text-apple-blue">
                        {row.duration}
                      </span>
                    ) : (
                      <span className="text-apple-text-3">—</span>
                    )}
                  </td>
                  <td className={tdCls}>
                    <LinkCell href={row.link_url} />
                  </td>
                  <td className={tdCls}>
                    <Thumb src={row.redeem_image_url} alt={`${row.name} 兑换商品`} />
                  </td>
                  <td className={tdCls}>
                    <RowActions
                      onEdit={() => openEdit(row)}
                      onDelete={() => setDeleting(row)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      )}

      <Modal
        open={modalOpen}
        title={editing ? '编辑订阅' : '新增订阅'}
        onClose={() => {
          if (!saving) setModalOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className={btnGhost}
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="submit"
              form="subscription-form"
              className={btnPrimary}
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        <form id="subscription-form" onSubmit={handleSave} className="space-y-4">
          <Field label="订阅名称" required>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="如：年度订阅"
              maxLength={60}
            />
          </Field>
          <Field label="价格" required hint="单位：元，保留两位小数">
            <input
              className={inputCls}
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
            />
          </Field>
          <Field label="订阅时长" hint="展示为徽章文案，如「月付」「季付」「年付」，选填">
            <input
              className={inputCls}
              value={form.duration}
              onChange={(e) =>
                setForm((f) => ({ ...f, duration: e.target.value }))
              }
              placeholder="月付"
              maxLength={20}
            />
          </Field>
          <Field
            label="订阅类型"
            hint={
              form.type === SUBSCRIPTION_TYPE.COUPON
                ? '卡券订阅：买的是「卡 + 券」，交付到用户的「我的券」（不会出现在「我的订阅」）'
                : form.type === SUBSCRIPTION_TYPE.DAILY_PLAN
                  ? '高级订阅：用户购买后解锁每日/定期内容，全局最多一条'
                  : '普通订阅：用户购买后内容进「我的订阅」'
            }
          >
            <select
              className={selectCls}
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({ ...f, type: e.target.value as SubscriptionType }))
              }
              disabled={saving}
            >
              {/* 文案一律取 SUBSCRIPTION_TYPE_LABEL —— 「高级订阅」的显示名在那里改，
                  底层值仍是 daily_plan，别在这里硬编码中文 */}
              <option value={SUBSCRIPTION_TYPE.NORMAL}>
                {SUBSCRIPTION_TYPE_LABEL.normal}
              </option>
              <option value={SUBSCRIPTION_TYPE.DAILY_PLAN} disabled={dailyPlanTaken}>
                {SUBSCRIPTION_TYPE_LABEL.daily_plan}
                {dailyPlanTaken ? '（已存在，仅能有一条）' : ''}
              </option>
              <option value={SUBSCRIPTION_TYPE.COUPON}>
                {SUBSCRIPTION_TYPE_LABEL.coupon}
              </option>
            </select>
          </Field>
          {/* 解锁有效天数已挪进下方的「高级设置」分组（迁移 036 一并归类） */}
          <Field
            label="详细介绍"
            hint="前台点击订阅卡片后弹层展示的完整介绍，选填"
          >
            <textarea
              className={textareaCls}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={4}
              placeholder="介绍订阅权益、适用范围与注意事项…"
              maxLength={600}
            />
          </Field>
          {/* 跳转链接 / 兑换商品：卡券订阅**不发内容**（它发的是卡和券），
              这两项填了也没用 —— 按类型条件渲染隐藏掉，别让站长白填 */}
          {form.type !== SUBSCRIPTION_TYPE.COUPON && (
            <>
              <Field label="跳转链接" hint="前台订阅卡片弹层的「了解更多」入口，选填">
                <input
                  className={inputCls}
                  value={form.link_url}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, link_url: e.target.value }))
                  }
                  placeholder="https://…"
                  inputMode="url"
                />
              </Field>
              <Field
                label="兑换商品"
                hint="不公开；买家在「兑换」页输入卡密成功后弹出该内容（图片 / 视频 / 文档）"
              >
                <FileUploader
                  value={form.redeem_image_url || null}
                  onChange={(url) =>
                    setForm((f) => ({ ...f, redeem_image_url: url ?? '' }))
                  }
                />
              </Field>
            </>
          )}
          <Field label="排序" hint="数字越小越靠前">
            <input
              className={inputCls}
              value={form.sort_order}
              onChange={(e) =>
                setForm((f) => ({ ...f, sort_order: e.target.value }))
              }
              type="number"
              step={1}
              inputMode="numeric"
            />
          </Field>
          {/* ---------- 高级设置（迁移 036） ----------
              这一组全是**纯展示**字段，不参与任何业务判定；留空即不显示。
              （真正的行为类设置如"到期后内容处理 / 上架时间窗 / 每人限购"不在这一批，
                它们要改业务逻辑，得单独决策。） */}
          <fieldset className="space-y-4 rounded-[12px] border border-[#E5E5EA] p-4">
            <legend className="px-1 text-[13px] font-semibold text-[#1D1D1F]">
              高级设置
            </legend>

            {form.type === 'daily_plan' && (
              <Field label="解锁有效天数" hint="自核销时刻起算；留空即永久有效">
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

            <Field
              label="角标文案"
              hint="订阅卡片右上角的小标签，如「热门」「限量」；留空不显示"
            >
              <input
                className={inputCls}
                value={form.badge_text}
                onChange={(e) => setForm((f) => ({ ...f, badge_text: e.target.value }))}
                maxLength={8}
                placeholder="留空 = 不显示"
                disabled={saving}
              />
            </Field>

            <Field label="权益清单" hint="购买弹层逐条展示「你将获得什么」；留空不显示">
              <div className="space-y-2">
                {form.benefits.map((b, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      className={inputCls}
                      value={b}
                      onChange={(e) => setBenefit(i, e.target.value)}
                      maxLength={60}
                      placeholder={`第 ${i + 1} 条，如「每周三更新精选内容」`}
                      disabled={saving}
                    />
                    <button
                      type="button"
                      className={`${btnGhost} px-2 text-[#D70015]`}
                      onClick={() => removeBenefit(i)}
                      disabled={saving}
                      aria-label="删除这条"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {form.benefits.length < 12 && (
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={addBenefit}
                    disabled={saving}
                  >
                    ＋ 添加一条
                  </button>
                )}
              </div>
            </Field>

            <Field
              label="购买须知 / 条款"
              hint="购买弹层底部的一段灰字（退款说明、注意事项…）；留空不显示"
            >
              <textarea
                className={textareaCls}
                value={form.terms_text}
                onChange={(e) => setForm((f) => ({ ...f, terms_text: e.target.value }))}
                rows={3}
                maxLength={400}
                placeholder="留空 = 不显示"
                disabled={saving}
              />
            </Field>

            <Field
              label="作为主推大卡"
              hint="前台订阅页最上面那张大卡；同时勾选多条时取列表第一张"
            >
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, is_featured: e.target.checked }))
                  }
                  disabled={saving}
                />
                把它放在订阅页顶部主推位
              </label>
            </Field>
          </fieldset>

          {/* ---------- 会员卡与优惠（迁移 023） ---------- */}
          <fieldset className="space-y-4 rounded-[12px] border border-[#E5E5EA] p-4">
            <legend className="px-1 text-[13px] font-semibold text-[#1D1D1F]">
              会员卡与优惠
            </legend>

            <Field
              label="会员卡样式"
              hint="持有本订阅的用户会在「我的库」看到这张卡；留空表示不发卡"
            >
              <select
                className={selectCls}
                value={form.card_style}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    card_style: e.target.value as '' | CardStyle,
                  }))
                }
              >
                <option value="">不发卡</option>
                {(Object.keys(CARD_STYLE_LABEL) as CardStyle[]).map((s) => (
                  <option key={s} value={s}>
                    {CARD_STYLE_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>

            {form.card_style && (
              <Field
                label="卡面文案"
                hint="显示在卡的正中间，大号字。留空则用订阅名称"
              >
                <input
                  className={inputCls}
                  value={form.card_text}
                  maxLength={16}
                  placeholder="如：年度会员"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, card_text: e.target.value }))
                  }
                />
              </Field>
            )}

            <Field
              label="享受折扣"
              hint="填减掉的百分比：填 20 即打 8 折。留空表示无折扣。与优惠券不叠加，结算时自动取更划算的那个"
            >
              <input
                className={inputCls}
                value={form.discount_percent}
                type="number"
                step="0.1"
                min="0"
                max="99.9"
                inputMode="decimal"
                placeholder="留空即无折扣"
                onChange={(e) =>
                  setForm((f) => ({ ...f, discount_percent: e.target.value }))
                }
              />
            </Field>

            {form.discount_percent.trim() !== '' && (
              <Field label="折扣范围" required hint="至少勾选一项，否则折扣不会生效">
                <div className="flex flex-wrap gap-4 pt-1">
                  {(Object.values(DISCOUNT_SCOPE) as DiscountScope[]).map(
                    (scope) => (
                      <label
                        key={scope}
                        className="flex items-center gap-2 text-[14px] text-[#1D1D1F]"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={form.discount_scope.includes(scope)}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              discount_scope: e.target.checked
                                ? [...f.discount_scope, scope]
                                : f.discount_scope.filter((s) => s !== scope),
                            }))
                          }
                        />
                        {DISCOUNT_SCOPE_LABEL[scope]}
                      </label>
                    ),
                  )}
                </div>
              </Field>
            )}

            <div className="flex flex-wrap gap-4">
              <Field label="优惠开始时间" hint="留空即不限">
                <input
                  className={inputCls}
                  type="datetime-local"
                  value={form.discount_valid_from}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      discount_valid_from: e.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="优惠结束时间" hint="留空即不限">
                <input
                  className={inputCls}
                  type="datetime-local"
                  value={form.discount_valid_to}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      discount_valid_to: e.target.value,
                    }))
                  }
                />
              </Field>
            </div>
          </fieldset>

          {/* 「加入券」（卡券订阅专属，迁移 033）。
              券关联是**订阅级**的，需要订阅已有 id —— 所以新建时只给提示，
              保存后再打开编辑即可加入。 */}
          {form.type === SUBSCRIPTION_TYPE.COUPON && (
            <Field
              label="加入券"
              hint={
                editing
                  ? '用户购买这条订阅、你确认收款后，会一次性获得这里列出的全部券（在「我的券」里查看）。⚠️ 想只给订阅用户？去券编辑器把那张券的「所属活动」留空即可 —— 否则它同时还能被任何人在活动页免费领。'
                  : '券关联要挂在已存在的订阅上：先保存这条订阅，再打开编辑即可加入券'
              }
            >
              {!editing ? (
                <p className="rounded-[8px] border border-dashed border-[#E5E5EA] px-3 py-2 text-[13px] text-[#86868B]">
                  保存后回来编辑，即可在这里加入券。
                </p>
              ) : (
                <div className="space-y-3">
                  {/* 已加入：可排序、可移除。顺序即发放顺序 */}
                  <div>
                    <p className="mb-1.5 text-[12px] text-[#86868B]">
                      已加入 {selectedCouponIds.length} 张（顺序即发放顺序）
                    </p>
                    {selectedCouponIds.length === 0 ? (
                      <p className="rounded-[8px] border border-dashed border-[#E5E5EA] px-3 py-2 text-[13px] text-[#86868B]">
                        还没有加入任何券 —— 用户购买后将获得这里列出的全部券。
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {selectedCouponIds.map((id, idx) => {
                          const c = couponById.get(id);
                          return (
                            <li
                              key={id}
                              className="flex items-center gap-1.5 rounded-[8px] border border-[#E5E5EA] px-2.5 py-1.5"
                            >
                              <span className="min-w-0 flex-1 truncate text-[13px]">
                                {c ? c.name : '（这张券已被删除）'}
                                {c && (
                                  <span className="ml-1.5 text-[#86868B]">
                                    {couponValueText(c)} · {couponThresholdText(c)}
                                  </span>
                                )}
                              </span>
                              <button
                                type="button"
                                className={`${btnGhost} px-2`}
                                onClick={() => moveCoupon(idx, -1)}
                                disabled={idx === 0 || saving}
                                aria-label="上移"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className={`${btnGhost} px-2`}
                                onClick={() => moveCoupon(idx, 1)}
                                disabled={idx === selectedCouponIds.length - 1 || saving}
                                aria-label="下移"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className={`${btnGhost} px-2 text-[#D70015]`}
                                onClick={() => removeCoupon(id)}
                                disabled={saving}
                                aria-label="移除"
                              >
                                ✕
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* 券库：搜索 + 点一下加入 */}
                  <div>
                    <input
                      className={inputCls}
                      value={couponQuery}
                      onChange={(e) => setCouponQuery(e.target.value)}
                      placeholder="搜索券名，点一下加入"
                      disabled={saving}
                    />
                    {couponLib === null ? (
                      <p className="mt-1.5 text-[13px] text-[#86868B]">正在加载券库…</p>
                    ) : couponCandidates.length === 0 ? (
                      <p className="mt-1.5 text-[13px] text-[#86868B]">
                        {couponQuery.trim()
                          ? '没有匹配的券'
                          : '没有可加入的券了（都在上面的列表里）'}
                      </p>
                    ) : (
                      <ul className="mt-1.5 max-h-56 space-y-1 overflow-auto">
                        {couponCandidates.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="w-full rounded-[8px] border border-[#E5E5EA] px-2.5 py-1.5 text-left text-[13px] transition-colors hover:border-[#0071E3] disabled:opacity-50"
                              onClick={() => addCoupon(c.id)}
                              disabled={saving}
                            >
                              <span className="font-medium">{c.name}</span>
                              <span className="ml-1.5 text-[#86868B]">
                                {couponValueText(c)} · {couponThresholdText(c)}
                              </span>
                              {!c.enabled && (
                                <span className="ml-1.5 text-[#D70015]">已停用</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </Field>
          )}

          {formError && (
            <p className="text-[13px] text-[#D70015]" role="alert">
              {formError}
            </p>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="删除订阅"
        message={
          deleting ? `确定要删除「${deleting.name}」吗？此操作不可恢复。` : ''
        }
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

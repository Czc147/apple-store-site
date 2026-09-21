'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Sparkles } from 'lucide-react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import type { Activity, MajorUnit, SubUnit, Subscription } from '@/lib/types';
import type { CardTargetType } from '@/lib/card-types';
import {
  Field,
  Notice,
  TableShell,
  btnGhost,
  btnPrimary,
  inputCls,
  selectCls,
  tdCls,
  thCls,
} from '../ui';
import CopyButton from '../CopyButton';

/** 生成对象类型：大单元 = 批量入口（展开为其下每个小单元各生成一批） */
type GenerateTargetType = 'major_unit' | CardTargetType;

/** POST /api/card-management/keys/generate 单个目标的结果 */
interface GenerateTargetResult {
  target_type: CardTargetType;
  target_id: string;
  target_name: string;
  group_name: string | null;
  card_product_id: string;
  product_created: boolean;
  requested: number;
  imported: number;
  shortfall: number;
  keys: string[];
}

interface GenerateResult {
  total_requested: number;
  total_imported: number;
  total_shortfall: number;
  created_products: number;
  targets: GenerateTargetResult[];
}

const TYPE_OPTIONS: Array<{ value: GenerateTargetType; label: string; hint: string }> = [
  { value: 'major_unit', label: '大单元', hint: '展开为其下每个小单元，各自生成一批' },
  { value: 'activity', label: '活动', hint: '给该活动对应的卡密商品生成' },
  { value: 'subscription', label: '订阅', hint: '给该订阅对应的卡密商品生成' },
];

/** 活动下拉文案：优先标题，回退介绍首行 */
function activityLabel(a: Activity): string {
  if (a.title && a.title.trim()) return a.title.trim();
  const firstLine = a.description?.split(/\r?\n/).find((l) => l.trim());
  return firstLine?.trim() || '未命名活动';
}

/** 文件名安全化（去路径/保留字符） */
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'keys';
}

/** 浏览器下载文本文件 */
function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 今日日期串（文件名用） */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 组合数可读化：1.4×10^18 */
function formatSpace(space: number): string {
  if (!Number.isFinite(space)) return '极大';
  if (space < 1e6) return `${Math.floor(space).toLocaleString('en-US')} 种`;
  const exp = Math.floor(Math.log10(space));
  const mantissa = space / 10 ** exp;
  return `${mantissa.toFixed(1)}×10^${exp} 种`;
}

/**
 * 一键生成卡密：
 * - 选对象（大单元 / 活动 / 订阅）→ 数量（大单元 = 每个小单元各生成多少张）
 * - 规格：位数、字符集（大写/小写/数字，至少一项）、可选前缀、排除易混字符 0/O/1/l/I
 * - 目标没有卡密商品时服务端自动创建
 * - 结果按对象分列，可单个复制 / 下载 TXT（每行一个，可直接再导入），或整体导出 CSV
 */
export default function CardKeyGenerate() {
  const [majors, setMajors] = useState<MajorUnit[]>([]);
  const [units, setUnits] = useState<SubUnit[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [plans, setPlans] = useState<Subscription[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [targetType, setTargetType] = useState<GenerateTargetType>('major_unit');
  const [targetId, setTargetId] = useState('');
  const [quantity, setQuantity] = useState('50');
  const [length, setLength] = useState('12');
  const [upper, setUpper] = useState(true);
  const [lower, setLower] = useState(false);
  const [digits, setDigits] = useState(true);
  const [excludeConfusing, setExcludeConfusing] = useState(true);
  const [prefix, setPrefix] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [majorsRes, unitsRes, actsRes, plansRes] = await Promise.all([
          adminFetch('/api/major-units'),
          adminFetch('/api/sub-units'),
          adminFetch('/api/activities'),
          adminFetch('/api/subscriptions'),
        ]);
        if (!majorsRes.ok) throw new Error(await extractError(majorsRes));
        if (!unitsRes.ok) throw new Error(await extractError(unitsRes));
        if (!actsRes.ok) throw new Error(await extractError(actsRes));
        if (!plansRes.ok) throw new Error(await extractError(plansRes));
        setMajors((await majorsRes.json()) as MajorUnit[]);
        setUnits((await unitsRes.json()) as SubUnit[]);
        setActivities((await actsRes.json()) as Activity[]);
        setPlans((await plansRes.json()) as Subscription[]);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : '数据加载失败');
      }
    })();
  }, []);

  // 切换对象类型时清空已选对象与上次结果
  const changeType = (t: GenerateTargetType) => {
    setTargetType(t);
    setTargetId('');
    setResult(null);
    setFormError(null);
  };

  const unitCountByMajor = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of units) map.set(u.major_unit_id, (map.get(u.major_unit_id) ?? 0) + 1);
    return map;
  }, [units]);

  const options = useMemo(() => {
    if (targetType === 'major_unit') {
      return majors.map((m) => ({
        id: m.id,
        label: `${m.name}（${unitCountByMajor.get(m.id) ?? 0} 个小单元）`,
      }));
    }
    if (targetType === 'activity') return activities.map((a) => ({ id: a.id, label: activityLabel(a) }));
    return plans.map((p) => ({
      id: p.id,
      label: `${p.name}${p.type === 'daily_plan' ? '（每日计划）' : ''}`,
    }));
  }, [targetType, majors, activities, plans, unitCountByMajor]);

  // 字符集与组合空间预览（与后端同口径：勾选组合 → 可排除易混）
  const alphabetSize = useMemo(() => {
    let n = 0;
    if (upper) n += 26;
    if (lower) n += 26;
    if (digits) n += 10;
    if (excludeConfusing && n > 0) {
      // 0/O/1/l/I 中落在已选字符集里的数量
      let drop = 0;
      if (upper && 'OI'.length) drop += 2; // O、I
      if (lower && 'l'.length) drop += 1; // l
      if (digits) drop += 2; // 0、1
      n = Math.max(0, n - drop);
    }
    return n;
  }, [upper, lower, digits, excludeConfusing]);

  const quantityNum = Number(quantity);
  const lengthNum = Number(length);
  const space =
    alphabetSize > 0 && Number.isInteger(lengthNum) && lengthNum > 0
      ? alphabetSize ** lengthNum
      : 0;

  const targetCount =
    targetType === 'major_unit'
      ? targetId
        ? unitCountByMajor.get(targetId) ?? 0
        : 0
      : targetId
        ? 1
        : 0;
  const totalPlanned =
    Number.isInteger(quantityNum) && quantityNum > 0 ? targetCount * quantityNum : 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!targetId) return setFormError(`请选择要生成卡密的${TYPE_OPTIONS.find((t) => t.value === targetType)?.label}`);
    if (!Number.isInteger(quantityNum) || quantityNum < 1) return setFormError('数量必须是正整数');
    if (!Number.isInteger(lengthNum) || lengthNum < 4 || lengthNum > 64) {
      return setFormError('位数必须是 4-64 的整数');
    }
    if (alphabetSize === 0) return setFormError('请至少选择一种字符');
    if (totalPlanned > 5000) {
      return setFormError(`本批共 ${totalPlanned} 张，超过单批上限 5000：请减少数量或分批生成`);
    }

    setSubmitting(true);
    setFormError(null);
    setResult(null);
    try {
      const res = await adminFetch('/api/card-management/keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          quantity: quantityNum,
          length: lengthNum,
          upper,
          lower,
          digits,
          exclude_confusing: excludeConfusing,
          prefix,
        }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      setResult((await res.json()) as GenerateResult);
      setNotice({ ok: true, text: '生成完成' });
      window.setTimeout(() => setNotice(null), 2500);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setSubmitting(false);
    }
  };

  /** 全部结果导出为一个 CSV（卡密,对象；首行表头，可直接再导入） */
  const downloadAllCsv = () => {
    if (!result) return;
    const lines = ['卡密,对象'];
    for (const t of result.targets) {
      for (const k of t.keys) lines.push(`${k},${t.target_name}`);
    }
    // BOM 让 Excel 正确识别 UTF-8；导入侧会自行去 BOM
    downloadText(`卡密-${today()}.csv`, '﻿' + lines.join('\r\n'));
  };

  if (loadError) {
    return (
      <div className="rounded-card border border-apple-border bg-apple-card p-6 text-center shadow-card">
        <p className="text-[14px] leading-relaxed text-apple-text-2">{loadError}</p>
        <Link href="/admin/card-management/keys" className={`${btnGhost} mt-4`}>
          返回卡密库存
        </Link>
      </div>
    );
  }

  return (
    <>
      <Link
        href="/admin/card-management/keys"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-apple-text-2 transition hover:text-apple-text"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        返回卡密库存
      </Link>

      <header className="mb-5">
        <h1 className="text-[22px] font-bold leading-tight text-apple-text">生成卡密</h1>
        <p className="mt-1 text-[13px] text-apple-text-2">
          选大单元 / 活动 / 订阅批量生成；大单元会展开为其下每个小单元各生成一批
        </p>
      </header>

      {/* 生成结果 */}
      {result && (
        <div className="mb-5 rounded-card border border-[#1B7F3B]/25 bg-[#E8F5E9] p-5">
          <p className="text-[15px] font-semibold text-[#1B7F3B]">
            生成完成：共 {result.total_imported} 张
            {result.created_products > 0 && ` · 自动创建 ${result.created_products} 个卡密商品`}
          </p>
          {result.total_shortfall > 0 && (
            <p className="mt-2 text-[13px] leading-relaxed text-[#B80012]">
              有 {result.total_shortfall} 张未能生成（字符组合空间不足或撞库过多），建议增加位数或放宽字符集后补齐
            </p>
          )}

          <div className="mt-3">
            <TableShell>
              <thead>
                <tr>
                  <th className={thCls}>对象</th>
                  <th className={thCls}>卡密商品</th>
                  <th className={thCls}>生成</th>
                  <th className={thCls}>导出</th>
                </tr>
              </thead>
              <tbody>
                {result.targets.map((t) => (
                  <tr key={t.target_id}>
                    <td className={tdCls}>
                      {t.group_name && (
                        <span className="block text-[11.5px] text-apple-text-3">{t.group_name}</span>
                      )}
                      {t.target_name}
                    </td>
                    <td className={tdCls}>
                      {t.product_created ? (
                        <span className="text-[12px] text-apple-blue">已自动创建</span>
                      ) : (
                        <span className="text-[12px] text-apple-text-3">沿用已有</span>
                      )}
                    </td>
                    <td className={tdCls}>
                      <span className="tabular-nums">{t.imported}</span>
                      <span className="text-apple-text-3"> / {t.requested}</span>
                    </td>
                    <td className={tdCls}>
                      <span className="flex items-center gap-2">
                        <CopyButton text={t.keys.join('\n')} />
                        {t.keys.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              downloadText(
                                `${safeName(t.target_name)}-${t.keys.length}张-${today()}.txt`,
                                t.keys.join('\n'),
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-apple-blue transition hover:bg-apple-blue-soft/60 active:scale-95"
                          >
                            <Download className="h-3 w-3" aria-hidden />
                            TXT
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={downloadAllCsv}>
              <Download className="h-4 w-4" aria-hidden />
              下载全部（CSV）
            </button>
            <Link href="/admin/card-management/keys" className={btnGhost}>
              查看卡密库存
            </Link>
            <button type="button" className={btnGhost} onClick={() => setResult(null)}>
              继续生成
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="max-w-2xl space-y-4 rounded-card border border-apple-border bg-apple-card p-6 shadow-card"
      >
        <Field label="生成对象" required>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {TYPE_OPTIONS.map((t) => (
              <label key={t.value} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="target_type"
                  value={t.value}
                  checked={targetType === t.value}
                  onChange={() => changeType(t.value)}
                  className="h-4 w-4 accent-apple-blue"
                  disabled={submitting}
                />
                <span className="text-[14px] text-apple-text">
                  {t.label}
                  <span className="ml-1 text-[12px] text-apple-text-3">（{t.hint}）</span>
                </span>
              </label>
            ))}
          </div>
        </Field>

        <Field
          label={`选择${TYPE_OPTIONS.find((t) => t.value === targetType)?.label}`}
          required
          hint={
            targetType === 'major_unit'
              ? '大单元下的每个小单元各自生成一批独立卡密（一码只解锁对应小单元）'
              : '没有卡密商品时会自动创建'
          }
        >
          <select
            className={selectCls}
            value={targetId}
            onChange={(e) => {
              setTargetId(e.target.value);
              setResult(null);
            }}
            disabled={submitting}
          >
            <option value="">请选择…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="数量"
            required
            hint={
              targetType === 'major_unit'
                ? '每个小单元各生成这么多张'
                : '该对象生成这么多张'
            }
          >
            <input
              className={inputCls}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="numeric"
              placeholder="50"
              disabled={submitting}
            />
          </Field>
          <Field label="位数" required hint="随机部分长度 4-64">
            <input
              className={inputCls}
              value={length}
              onChange={(e) => setLength(e.target.value)}
              inputMode="numeric"
              placeholder="12"
              disabled={submitting}
            />
          </Field>
        </div>

        <Field label="字符集" required hint="至少选一种">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {[
              { label: '大写字母 A-Z', checked: upper, set: setUpper },
              { label: '小写字母 a-z', checked: lower, set: setLower },
              { label: '数字 0-9', checked: digits, set: setDigits },
            ].map((c) => (
              <label key={c.label} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={c.checked}
                  onChange={(e) => c.set(e.target.checked)}
                  className="h-4 w-4 accent-apple-blue"
                  disabled={submitting}
                />
                <span className="text-[14px] text-apple-text">{c.label}</span>
              </label>
            ))}
          </div>
        </Field>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-apple-hairline bg-apple-bg/40 px-3.5 py-3">
          <input
            type="checkbox"
            checked={excludeConfusing}
            onChange={(e) => setExcludeConfusing(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-apple-blue"
            disabled={submitting}
          />
          <span className="text-[13px] leading-relaxed text-apple-text">
            排除易混字符（0 O 1 l I）
            <span className="block text-[12px] text-apple-text-3">
              买家手抄 / 输入时最容易看错这几个字符，建议保持勾选
            </span>
          </span>
        </label>

        <Field label="前缀" hint="可选，如 VIP-；不能含空格">
          <input
            className={`${inputCls} font-mono`}
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            maxLength={32}
            placeholder="VIP-"
            disabled={submitting}
          />
        </Field>

        <p className="flex items-start gap-2 rounded-lg bg-apple-bg/60 px-3.5 py-3 text-[12.5px] leading-relaxed text-apple-text-2">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-none text-apple-blue" aria-hidden />
          <span>
            本次将生成{' '}
            <span className="font-semibold text-apple-text">
              {targetCount > 0 ? `${targetCount} 个对象 × ${Number.isInteger(quantityNum) ? quantityNum : 0} 张 = ${totalPlanned} 张` : '（请先选择对象）'}
            </span>
            ；可用字符 {alphabetSize} 个 · 位数 {Number.isInteger(lengthNum) ? lengthNum : 0} → 组合空间约{' '}
            {formatSpace(space)}
          </span>
        </p>

        {formError && (
          <p className="text-[13px] text-[#D70015]" role="alert">
            {formError}
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" className={btnPrimary} disabled={submitting}>
            {submitting ? '生成中…' : '生成卡密'}
          </button>
          <span className="text-[12px] text-apple-text-3">
            生成即入库（unused），同一商品内不重复
          </span>
        </div>
      </form>

      <Notice notice={notice} />
    </>
  );
}

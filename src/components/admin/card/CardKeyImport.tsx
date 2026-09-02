'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileUp } from 'lucide-react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import {
  Field,
  Notice,
  textareaCls,
  selectCls,
  btnPrimary,
  btnGhost,
} from '../ui';
import { productLabel, type CardProductRow } from './shared';

/** POST /api/card-management/keys/import 成功响应 */
interface ImportResult {
  card_product_id: string;
  parsed: number;
  imported: number;
  skipped_duplicates: number;
  skipped_invalid: number;
}

/** 单个文件大小上限（2 MB，足够数千条卡密） */
const MAX_FILE_SIZE = 2 * 1024 * 1024;

/** 文本格式选项（提到 JSX 外，避免 tsx 内联泛型断言的解析歧义） */
const FORMAT_OPTIONS: Array<{ value: 'txt' | 'csv'; label: string }> = [
  { value: 'txt', label: 'TXT：每行一个卡密' },
  { value: 'csv', label: 'CSV：取每行第一列（自动跳过表头）' },
];

/**
 * 批量导入卡密：
 * - 拖拽 / 点选 TXT、CSV 文件（自动读入文本并识别格式），也可直接粘贴
 * - txt：每行一个卡密；csv：取每行第一列（自动跳过表头）
 * - 默认自动跳过重复（批内 + 库内）；取消勾选则为严格模式（任何重复整体拒绝）
 * - 成功后展示解析 / 导入 / 跳过明细
 */
export default function CardKeyImport() {
  const [products, setProducts] = useState<CardProductRow[]>([]);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productId, setProductId] = useState('');
  const [format, setFormat] = useState<'txt' | 'csv'>('txt');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [raw, setRaw] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<number | null>(null);

  const showNotice = useCallback((okFlag: boolean, text: string) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice({ ok: okFlag, text });
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500);
  }, []);

  // 载入商品下拉；支持 ?product= 预选
  useEffect(() => {
    void (async () => {
      try {
        const res = await adminFetch('/api/card-management/products');
        if (!res.ok) throw new Error(await extractError(res));
        const list = (await res.json()) as CardProductRow[];
        setProducts(list);
        const sp = new URLSearchParams(window.location.search);
        const p = sp.get('product')?.trim() || '';
        if (p && list.some((x) => x.id === p)) setProductId(p);
      } catch (e) {
        setProductsError(e instanceof Error ? e.message : '商品列表加载失败');
      }
    })();
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  /** 读入文件内容：校验扩展名 / 大小，按扩展名自动识别格式 */
  const handleFile = useCallback(async (file: File | undefined | null) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.txt') && !name.endsWith('.csv')) {
      setFormError('仅支持 .txt 或 .csv 文件');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFormError('文件过大（上限 2 MB），请拆分后再导入');
      return;
    }
    try {
      const text = await file.text();
      setRaw(text);
      setFileName(file.name);
      setFormat(name.endsWith('.csv') ? 'csv' : 'txt');
      setFormError(null);
      setResult(null);
    } catch {
      setFormError('文件读取失败，请确认文件为 UTF-8 编码后重试');
    }
  }, []);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    void handleFile(e.dataTransfer.files?.[0]);
  };

  const lineCount = raw.split(/\r\n|\r|\n/).filter((l) => l.trim()).length;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!productId) return setFormError('请选择要导入的卡密商品');
    if (!raw.trim()) return setFormError('请粘贴卡密文本，或拖入 / 选择 TXT、CSV 文件');

    setSubmitting(true);
    setFormError(null);
    setResult(null);
    try {
      const res = await adminFetch('/api/card-management/keys/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_product_id: productId,
          raw,
          format,
          skip_duplicates: skipDuplicates,
        }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      setResult((await res.json()) as ImportResult);
      setRaw('');
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      showNotice(true, '导入完成');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (productsError) {
    return (
      <div className="rounded-card border border-apple-border bg-apple-card p-6 text-center shadow-card">
        <p className="text-[14px] leading-relaxed text-apple-text-2">{productsError}</p>
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
        <h1 className="text-[22px] font-bold leading-tight text-apple-text">批量导入卡密</h1>
        <p className="mt-1 text-[13px] text-apple-text-2">
          支持拖拽 TXT / CSV 文件或直接粘贴文本；同一商品内卡密不可重复
        </p>
      </header>

      {/* 导入结果 */}
      {result && (
        <div className="mb-5 rounded-card border border-[#1B7F3B]/25 bg-[#E8F5E9] p-5">
          <p className="text-[15px] font-semibold text-[#1B7F3B]">
            导入完成：成功导入 {result.imported} 条
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-white/70 px-3 py-2">
              <dt className="text-[12px] text-apple-text-2">解析有效</dt>
              <dd className="text-[18px] font-bold tabular-nums text-apple-text">
                {result.parsed}
              </dd>
            </div>
            <div className="rounded-lg bg-white/70 px-3 py-2">
              <dt className="text-[12px] text-apple-text-2">跳过重复</dt>
              <dd className="text-[18px] font-bold tabular-nums text-apple-text">
                {result.skipped_duplicates}
              </dd>
            </div>
            <div className="rounded-lg bg-white/70 px-3 py-2">
              <dt className="text-[12px] text-apple-text-2">跳过无效</dt>
              <dd className="text-[18px] font-bold tabular-nums text-apple-text">
                {result.skipped_invalid}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/admin/card-management/keys?product=${result.card_product_id}`}
              className={btnPrimary}
            >
              查看该商品卡密
            </Link>
            <button type="button" className={btnGhost} onClick={() => setResult(null)}>
              继续导入
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="max-w-2xl space-y-4 rounded-card border border-apple-border bg-apple-card p-6 shadow-card"
      >
        <Field label="导入到商品" required hint="商品无需处于启用状态，可先补货再启用">
          <select
            className={selectCls}
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setResult(null);
            }}
            disabled={submitting}
          >
            <option value="">请选择…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {productLabel(p)}
                {p.enabled ? '' : '（已禁用）'}
              </option>
            ))}
          </select>
        </Field>

        {/* 拖拽区 */}
        <div
          role="button"
          tabIndex={0}
          aria-label="选择或拖拽 TXT / CSV 文件"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border-2 border-dashed px-6 py-9 text-center transition ${
            dragActive
              ? 'border-apple-blue bg-apple-blue-soft/50'
              : 'border-apple-border bg-apple-bg/50 hover:border-apple-blue/60'
          }`}
        >
          <FileUp className="h-6 w-6 text-apple-text-3" aria-hidden />
          <p className="text-[14px] font-medium text-apple-text">
            拖拽 TXT / CSV 文件到此处，或点击选择文件
          </p>
          <p className="text-[12px] leading-relaxed text-apple-text-3">
            单个文件 ≤ 2 MB，请确保 UTF-8 编码
            {fileName && (
              <span className="mt-1 block font-medium text-apple-blue">
                已读入：{fileName}
              </span>
            )}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            className="hidden"
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        <Field
          label="卡密文本"
          required
          hint={
            lineCount > 0
              ? `当前共 ${lineCount} 行非空内容（单批上限 5000 条）`
              : '选择文件后内容会显示在这里，也可以直接粘贴'
          }
        >
          <textarea
            className={`${textareaCls} font-mono text-[13px]`}
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setFileName(null);
              setResult(null);
            }}
            rows={8}
            placeholder={'KEY-0001\nKEY-0002\n…每行一个卡密'}
            disabled={submitting}
          />
        </Field>

        {/* 格式选择 */}
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {FORMAT_OPTIONS.map(({ value, label }) => (
            <label key={value} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="format"
                value={value}
                checked={format === value}
                onChange={() => setFormat(value)}
                className="h-4 w-4 accent-apple-blue"
                disabled={submitting}
              />
              <span className="text-[14px] text-apple-text">{label}</span>
            </label>
          ))}
        </div>

        {/* 重复处理策略 */}
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-apple-hairline bg-apple-bg/40 px-3.5 py-3">
          <input
            type="checkbox"
            checked={skipDuplicates}
            onChange={(e) => setSkipDuplicates(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-apple-blue"
            disabled={submitting}
          />
          <span className="text-[13px] leading-relaxed text-apple-text">
            自动跳过重复卡密（推荐）
            <span className="block text-[12px] text-apple-text-3">
              批内重复与库内已有重复将被跳过并在结果中计数；取消勾选则启用严格模式——
              一旦发现任何重复将整体拒绝，不写入任何数据
            </span>
          </span>
        </label>

        {formError && (
          <p className="text-[13px] text-[#D70015]" role="alert">
            {formError}
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" className={btnPrimary} disabled={submitting}>
            {submitting ? '导入中…' : '开始导入'}
          </button>
          <span className="text-[12px] text-apple-text-3">
            导入为原子操作：要么全部写入，要么一条不写
          </span>
        </div>
      </form>

      <Notice notice={notice} />
    </>
  );
}

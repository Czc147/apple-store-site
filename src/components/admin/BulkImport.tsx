'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { FileUp, FolderUp, Play } from 'lucide-react';
import { unzipSync } from 'fflate';
import type { MajorUnit, SubUnit } from '@/lib/types';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import type { CardProductRow } from './card/shared';
import {
  Badge,
  Field,
  Notice,
  PageHeader,
  TableShell,
  btnGhost,
  btnPrimary,
  selectCls,
  tdCls,
  thCls,
} from './ui';

/** 视为「兑换内容」的图片扩展名（其余扩展名除 .txt 外一律跳过并警告） */
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
/** zip 解出的文件无 MIME，按扩展名补回以通过 /api/upload 类型校验 */
const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  txt: 'text/plain',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
};
const MANIFEST_KEY = 'bulk-import.manifest.v1';
const MAX_UNITS = 500;

interface InputFile {
  path: string;
  file: File;
  size: number;
  mtime: number;
  ext: string;
}

interface ParsedUnit {
  name: string;
  images: InputFile[];
  txts: InputFile[];
  txtRaw: string;
  files: InputFile[];
}

interface UnitResult {
  name: string;
  status: 'ok' | 'skipped' | 'error';
  detail: string;
}

function extOf(name: string): string {
  const n = name.toLowerCase();
  const i = n.lastIndexOf('.');
  return i >= 0 ? n.slice(i + 1) : '';
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

function toInputFile(path: string, file: File): InputFile {
  return { path, file, size: file.size, mtime: file.lastModified, ext: extOf(file.name) };
}

function sig(f: InputFile): string {
  return `${f.path}::${f.size}::${f.mtime}`;
}

/** zip 内若所有条目共享同一顶层目录，剥掉该前缀（「压缩整个文件夹」的常见情形） */
function stripCommonPrefix(names: string[]): string[] {
  if (names.length === 0) return names;
  const split = names.map((n) => n.split('/').filter(Boolean));
  let len = 0;
  const first = split[0];
  outer: while (len < first.length) {
    const seg = first[len];
    for (const s of split) {
      if (s.length <= len || s[len] !== seg) break outer;
    }
    len += 1;
  }
  if (len === 0) return names;
  return names.map((n) => n.split('/').filter(Boolean).slice(len).join('/'));
}

function groupUnits(files: InputFile[]): { units: ParsedUnit[]; skipped: InputFile[] } {
  const map = new Map<string, ParsedUnit>();
  const skipped: InputFile[] = [];
  const ensure = (name: string): ParsedUnit => {
    let u = map.get(name);
    if (!u) {
      u = { name, images: [], txts: [], txtRaw: '', files: [] };
      map.set(name, u);
    }
    return u;
  };
  for (const f of files) {
    const segs = f.path.split('/').filter(Boolean);
    if (segs.length === 0) {
      skipped.push(f);
      continue;
    }
    // 子文件夹模式：第一段为单元名；平铺模式：文件名（去扩展名）为单元名
    const unitName = segs.length > 1 ? segs[0] : stripExt(segs[0]);
    if (!unitName) {
      skipped.push(f);
      continue;
    }
    if (IMAGE_EXTS.has(f.ext)) {
      const u = ensure(unitName);
      u.images.push(f);
      u.files.push(f);
    } else if (f.ext === 'txt') {
      const u = ensure(unitName);
      u.txts.push(f);
      u.files.push(f);
    } else {
      skipped.push(f);
    }
  }
  const units = [...map.values()].filter((u) => u.images.length > 0 || u.txts.length > 0);
  return { units, skipped };
}

async function finalizeUnits(units: ParsedUnit[]): Promise<ParsedUnit[]> {
  for (const u of units) {
    const parts: string[] = [];
    for (const t of u.txts) {
      try {
        parts.push(await t.file.text());
      } catch {
        /* 读取失败按空处理 */
      }
    }
    u.txtRaw = parts.filter((p) => p.trim()).join('\n');
  }
  return units;
}

async function unzipFile(file: File): Promise<InputFile[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(buf);
  const rawNames = Object.keys(entries);
  const names = stripCommonPrefix(rawNames);
  return names.map((path, i) => {
    const data = entries[rawNames[i]];
    const name = path.split('/').filter(Boolean).pop() ?? path;
    const ext = extOf(name);
    // 从 zip 解出的 Blob 无 MIME，需按扩展名补回，否则 /api/upload 无法识别类型
    const mime = EXT_MIME[ext] ?? '';
    return {
      path,
      file: new File([data as BlobPart], name, { type: mime }),
      size: data.length,
      mtime: 0,
      ext,
    };
  });
}

async function traverseEntry(
  entry: any,
  prefix: string,
  out: InputFile[],
  isRoot = false,
): Promise<void> {
  if (entry.isFile) {
    const file: File = await new Promise((res, rej) => entry.file(res, rej));
    out.push(toInputFile(prefix ? `${prefix}/${entry.name}` : entry.name, file));
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const children: any[] = await new Promise((res, rej) => {
      const all: any[] = [];
      const readBatch = () =>
        reader.readEntries((batch: any[]) => {
          if (batch.length === 0) res(all);
          else {
            all.push(...batch);
            readBatch();
          }
        }, rej);
      readBatch();
    });
    // 拖入的根文件夹自身名字不计入路径（与 webkitdirectory 剥掉第一段一致）；
    // 更深层的子文件夹名仍保留，作为「子文件夹 = 单元名」的匹配依据
    const next = isRoot ? prefix : prefix ? `${prefix}/${entry.name}` : entry.name;
    for (const c of children) await traverseEntry(c, next, out);
  }
}

async function readDataTransfer(items: DataTransferItemList): Promise<InputFile[]> {
  const entries: any[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as any;
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
  }
  const out: InputFile[] = [];
  for (const e of entries) await traverseEntry(e, '', out, true);
  return out;
}

function lineCount(raw: string): number {
  return raw.split(/\r\n|\r|\n/).filter((l) => l.trim()).length;
}

async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await adminFetch('/api/upload', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await extractError(res));
  const data = await res.json();
  if (typeof data?.url !== 'string' || !data.url) throw new Error('上传响应缺少 url');
  return data.url;
}

async function createProduct(subUnitId: string): Promise<string> {
  const res = await adminFetch('/api/card-management/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target_type: 'sub_unit',
      target_id: subUnitId,
      redeem_type: 'content',
      enabled: true,
    }),
  });
  if (!res.ok) throw new Error(await extractError(res));
  const data = await res.json();
  if (typeof data?.id !== 'string') throw new Error('创建商品响应缺少 id');
  return data.id;
}

async function importKeys(
  productId: string,
  raw: string,
): Promise<{ imported: number; skipped_duplicates: number }> {
  const res = await adminFetch('/api/card-management/keys/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      card_product_id: productId,
      raw,
      format: 'txt',
      skip_duplicates: true,
    }),
  });
  if (!res.ok) throw new Error(await extractError(res));
  return (await res.json()) as { imported: number; skipped_duplicates: number };
}

function loadManifest(): Set<string> {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY);
    if (!raw) return new Set<string>();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

function persistManifest(set: Set<string>): void {
  try {
    localStorage.setItem(MANIFEST_KEY, JSON.stringify([...set]));
  } catch {
    /* 存储满 / 隐私模式忽略 */
  }
}

/**
 * 文件夹批量导入（ABC 组合）：
 * - A：拖入文件夹或 zip，客户端（fflate）解压；图片 = 兑换内容、.txt = 卡密；
 *      子文件夹名 / 文件名（去扩展名）= 小单元名，匹配当前大单元下的小单元
 * - B：localStorage 记「路径+大小+mtime」清单，重拖只处理新增/改动
 * - C：匹配到单元但无卡密商品时按默认参数自动补建（默认关）
 */
export default function BulkImport() {
  const [majors, setMajors] = useState<MajorUnit[]>([]);
  const [selectedMajor, setSelectedMajor] = useState('');
  const [subUnits, setSubUnits] = useState<SubUnit[]>([]);
  const [products, setProducts] = useState<CardProductRow[]>([]);
  const [manifest, setManifest] = useState<Set<string>>(loadManifest);
  const [units, setUnits] = useState<ParsedUnit[]>([]);
  const [skippedFiles, setSkippedFiles] = useState<InputFile[]>([]);
  const [autoCreate, setAutoCreate] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const [results, setResults] = useState<UnitResult[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<number | null>(null);

  const showNotice = useCallback((ok: boolean, text: string) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice({ ok, text });
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500);
  }, []);

  const loadMajors = useCallback(async () => {
    const res = await adminFetch('/api/major-units');
    if (!res.ok) throw new Error(await extractError(res));
    const list = (await res.json()) as MajorUnit[];
    setMajors(list);
    setSelectedMajor((prev) =>
      prev && list.some((m) => m.id === prev) ? prev : list[0]?.id ?? '',
    );
  }, []);

  const loadProducts = useCallback(async () => {
    const res = await adminFetch('/api/card-management/products');
    if (!res.ok) throw new Error(await extractError(res));
    setProducts((await res.json()) as CardProductRow[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([loadMajors(), loadProducts()]);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : '加载失败');
      }
    })();
    return () => {
      cancelled = true;
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, [loadMajors, loadProducts]);

  useEffect(() => {
    if (!selectedMajor) {
      setSubUnits([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await adminFetch(
          `/api/sub-units?major_unit_id=${encodeURIComponent(selectedMajor)}`,
        );
        if (!res.ok) throw new Error(await extractError(res));
        if (!cancelled) setSubUnits((await res.json()) as SubUnit[]);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : '小单元加载失败');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedMajor]);

  const applyFiles = useCallback(async (inputFiles: InputFile[]) => {
    const { units: parsed, skipped } = groupUnits(inputFiles);
    const finalized = await finalizeUnits(parsed);
    setUnits(finalized);
    setSkippedFiles(skipped);
    setResults([]);
    setFormError(null);
  }, []);

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (executing) return;
    try {
      const items = e.dataTransfer.items;
      const hasDir = Array.from(items).some(
        (it: any) => it.webkitGetAsEntry?.()?.isDirectory,
      );
      const files = Array.from(e.dataTransfer.files);
      const zip = !hasDir ? files.find((f) => f.name.toLowerCase().endsWith('.zip')) : undefined;
      if (zip) {
        await applyFiles(await unzipFile(zip));
      } else {
        let list = await readDataTransfer(items);
        if (list.length === 0) list = files.map((f) => toInputFile(f.name, f));
        await applyFiles(list);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '读取失败');
    }
  };

  const onFolderInput = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const files = Array.from(list).map((f) => {
      const rel = (f as any).webkitRelativePath as string | undefined;
      let path: string;
      if (rel) {
        const segs = rel.split('/').filter(Boolean);
        path = segs.length > 1 ? segs.slice(1).join('/') : f.name;
      } else {
        path = f.name;
      }
      return toInputFile(path, f);
    });
    await applyFiles(files);
    e.target.value = '';
  };

  const onFileInput = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const arr = Array.from(list);
    const zip = arr.find((f) => f.name.toLowerCase().endsWith('.zip'));
    try {
      if (zip) await applyFiles(await unzipFile(zip));
      else await applyFiles(arr.map((f) => toInputFile(f.name, f)));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '读取失败');
    }
    e.target.value = '';
  };

  const subUnitByName = useMemo(
    () => new Map(subUnits.map((s) => [s.name, s])),
    [subUnits],
  );
  const productBySubUnit = useMemo(() => {
    const m = new Map<string, CardProductRow>();
    for (const p of products) {
      if (p.target_type === 'sub_unit' && p.target_id) m.set(p.target_id, p);
    }
    return m;
  }, [products]);

  const rows = useMemo(
    () =>
      units.map((u) => {
        const sub = subUnitByName.get(u.name);
        const hasChanges = u.files.some((f) => !manifest.has(sig(f)));
        const product = sub ? productBySubUnit.get(sub.id) : undefined;
        return { unit: u, sub, matched: Boolean(sub), hasChanges, product };
      }),
    [units, subUnitByName, productBySubUnit, manifest],
  );

  const summary = useMemo(() => {
    const matched = rows.filter((r) => r.matched).length;
    const pending = rows.filter((r) => r.matched && r.hasChanges).length;
    const already = rows.filter((r) => r.matched && !r.hasChanges).length;
    return { total: rows.length, matched, unmatched: rows.length - matched, pending, already };
  }, [rows]);

  const execute = useCallback(async () => {
    if (executing) return;
    if (!selectedMajor) return setFormError('请先选择大单元');
    if (units.length === 0) return setFormError('请先拖入文件夹或 zip');
    if (units.length > MAX_UNITS)
      return setFormError(`单次最多处理 ${MAX_UNITS} 个单元，当前 ${units.length} 个`);

    const targets = rows.filter((r) => r.matched && r.hasChanges);
    if (targets.length === 0) return setFormError('没有需要处理的新增/改动单元');

    setExecuting(true);
    setResults([]);
    setFormError(null);
    const nextManifest = new Set(manifest);
    const createdProducts = new Map<string, string>();
    const out: UnitResult[] = [];

    let done = 0;
    for (const r of targets) {
      done += 1;
      setProgress({ done, total: targets.length, name: r.unit.name });
      const sub = r.sub as SubUnit;
      const detail: string[] = [];
      let status: UnitResult['status'] = 'ok';
      const processedSigs: string[] = [];

      if (r.unit.images.length > 0) {
        try {
          const url = await uploadImage(r.unit.images[0].file);
          const putRes = await adminFetch(`/api/sub-units/${sub.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ redeem_image_url: url }),
          });
          if (!putRes.ok) throw new Error(await extractError(putRes));
          detail.push('已更新兑换内容');
          processedSigs.push(sig(r.unit.images[0]));
        } catch (err) {
          status = 'error';
          detail.push(`兑换内容失败：${err instanceof Error ? err.message : '未知错误'}`);
        }
      }

      if (r.unit.txtRaw.trim()) {
        try {
          let productId = r.product?.id ?? createdProducts.get(sub.id);
          if (!productId) {
            if (autoCreate) {
              productId = await createProduct(sub.id);
              createdProducts.set(sub.id, productId);
              detail.push('已自动创建卡密商品');
            }
          }
          if (productId) {
            const imp = await importKeys(productId, r.unit.txtRaw);
            detail.push(
              `导入卡密 ${imp.imported} 条${imp.skipped_duplicates ? `（跳过重复 ${imp.skipped_duplicates}）` : ''}`,
            );
            for (const t of r.unit.txts) processedSigs.push(sig(t));
          } else {
            if (status === 'ok') status = 'skipped';
            detail.push('跳过卡密：无卡密商品（未启用自动补建）');
          }
        } catch (err) {
          status = 'error';
          detail.push(`卡密导入失败：${err instanceof Error ? err.message : '未知错误'}`);
        }
      }

      for (const s of processedSigs) nextManifest.add(s);
      out.push({ name: r.unit.name, status, detail: detail.join('；') || '无需操作' });
      setResults([...out]);
    }

    setManifest(nextManifest);
    persistManifest(nextManifest);
    setProgress(null);
    setExecuting(false);
    showNotice(true, '批量导入完成');
    void loadProducts();
  }, [executing, selectedMajor, units, rows, manifest, autoCreate, showNotice, loadProducts]);

  const majorName = (id: string) => majors.find((m) => m.id === id)?.name ?? '未知';

  if (loadError) {
    return (
      <div className="rounded-card border border-apple-border bg-apple-card p-6 text-center shadow-card">
        <p className="text-[14px] leading-relaxed text-apple-text-2">{loadError}</p>
        <button type="button" className={`${btnGhost} mt-4`} onClick={() => window.location.reload()}>
          重试
        </button>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="文件夹批量导入"
        description="拖入文件夹或 zip：图片作为兑换内容、.txt 作为卡密，自动匹配当前大单元下的小单元并批量执行"
      />

      <div className="max-w-2xl space-y-4">
        {/* 大单元选择 */}
        <div className="rounded-card border border-apple-border bg-apple-card p-6 shadow-card">
          <Field label="大单元" required hint="选定后只匹配该大单元名下的小单元">
            <select
              className={selectCls}
              value={selectedMajor}
              onChange={(e) => setSelectedMajor(e.target.value)}
              disabled={executing}
            >
              <option value="">请选择…</option>
              {majors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* 拖拽区 */}
        <div
          role="button"
          tabIndex={0}
          aria-label="拖入文件夹或 zip"
          onClick={() => {
            if (!executing) fileInputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !executing) fileInputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-6 py-10 text-center transition ${
            dragActive
              ? 'border-apple-blue bg-apple-blue-soft/50'
              : 'border-apple-border bg-apple-bg/50 hover:border-apple-blue/60'
          }`}
        >
          <FileUp className="h-7 w-7 text-apple-text-3" aria-hidden />
          <p className="text-[15px] font-medium text-apple-text">
            拖入文件夹或 ZIP 到此处
          </p>
          <p className="max-w-md text-[12.5px] leading-relaxed text-apple-text-3">
            图片文件 = 兑换内容；.txt = 卡密（多个合并）；
            子文件夹名或文件名（去扩展名）= 小单元名，匹配不上会跳过并警告
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btnGhost}
            onClick={() => folderInputRef.current?.click()}
            disabled={executing}
          >
            <FolderUp className="h-4 w-4" aria-hidden />
            选择文件夹
          </button>
          <button
            type="button"
            className={btnGhost}
            onClick={() => fileInputRef.current?.click()}
            disabled={executing}
          >
            <FileUp className="h-4 w-4" aria-hidden />
            选择 ZIP / 文件
          </button>
          {units.length > 0 && !executing && (
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                setUnits([]);
                setSkippedFiles([]);
                setResults([]);
                setFormError(null);
              }}
            >
              清空
            </button>
          )}
        </div>

        <input
          ref={folderInputRef}
          type="file"
          multiple
          {...({ webkitdirectory: '' } as any)}
          className="hidden"
          onChange={onFolderInput}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".zip,image/*,.txt"
          className="hidden"
          onChange={onFileInput}
        />

        {/* 自动补建 */}
        <label className="flex cursor-pointer items-start gap-2.5 rounded-card border border-apple-hairline bg-apple-card p-4 shadow-card">
          <input
            type="checkbox"
            checked={autoCreate}
            onChange={(e) => setAutoCreate(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-apple-blue"
            disabled={executing}
          />
          <span className="text-[13px] leading-relaxed text-apple-text">
            缺少卡密商品时自动补建（默认关）
            <span className="block text-[12px] text-apple-text-3">
              匹配到小单元、但该单元尚无卡密商品时，按默认参数（兑换内容 / 启用）自动创建商品后再导入卡密
            </span>
          </span>
        </label>
      </div>

      {formError && (
        <p className="mt-4 text-[13px] text-[#D70015]" role="alert">
          {formError}
        </p>
      )}

      {/* 预览对照表 */}
      {units.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-apple-text-2">
            <span>
              识别 <span className="font-semibold text-apple-text">{summary.total}</span> 个单元
            </span>
            <span>
              匹配 <span className="font-semibold text-[#1B7F3B]">{summary.matched}</span>
            </span>
            {summary.unmatched > 0 && (
              <span>
                未匹配 <span className="font-semibold text-[#8A6100]">{summary.unmatched}</span>
              </span>
            )}
            <span>
              待处理 <span className="font-semibold text-apple-blue">{summary.pending}</span>
            </span>
            {summary.already > 0 && (
              <span>
                已导入（无变化）{' '}
                <span className="font-semibold text-apple-text-3">{summary.already}</span>
              </span>
            )}
          </div>

          <TableShell>
            <thead>
              <tr>
                <th className={thCls}>单元名</th>
                <th className={thCls}>匹配</th>
                <th className={thCls}>兑换内容</th>
                <th className={thCls}>卡密</th>
                <th className={thCls}>卡密商品</th>
                <th className={thCls}>状态</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.unit.name} className="transition hover:bg-apple-bg/60">
                  <td className={`${tdCls} font-medium`}>{r.unit.name}</td>
                  <td className={tdCls}>
                    {r.matched ? (
                      <Badge tone="green">{r.sub!.name}</Badge>
                    ) : (
                      <Badge tone="amber">未匹配</Badge>
                    )}
                  </td>
                  <td className={tdCls}>
                    {r.unit.images.length > 0 ? (
                      <span className="truncate text-[13px]">{r.unit.images[0].path}</span>
                    ) : (
                      <span className="text-apple-text-3">—</span>
                    )}
                  </td>
                  <td className={tdCls}>
                    {r.unit.txtRaw.trim() ? (
                      <span className="text-[13px]">
                        {r.unit.txts.length} 个 txt · {lineCount(r.unit.txtRaw)} 行
                      </span>
                    ) : (
                      <span className="text-apple-text-3">—</span>
                    )}
                  </td>
                  <td className={tdCls}>
                    {!r.matched ? (
                      <span className="text-apple-text-3">—</span>
                    ) : r.product ? (
                      <Badge tone="gray">已关联</Badge>
                    ) : autoCreate ? (
                      <Badge tone="blue">将自动创建</Badge>
                    ) : (
                      <Badge tone="amber">跳过（未关联）</Badge>
                    )}
                  </td>
                  <td className={tdCls}>
                    {!r.matched ? (
                      <Badge tone="amber">跳过</Badge>
                    ) : !r.hasChanges ? (
                      <Badge tone="gray">已导入</Badge>
                    ) : (
                      <Badge tone="blue">待处理</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>

          {skippedFiles.length > 0 && (
            <p className="mt-3 text-[12.5px] text-[#8A6100]">
              已跳过 {skippedFiles.length} 个无法识别的文件（非图片 / 非 txt）：
              {skippedFiles.slice(0, 5).map((f) => f.path).join('、')}
              {skippedFiles.length > 5 ? '…' : ''}
            </p>
          )}
        </div>
      )}

      {/* 执行 */}
      {units.length > 0 && (
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            className={btnPrimary}
            onClick={() => void execute()}
            disabled={executing || summary.pending === 0}
          >
            <Play className="h-4 w-4" aria-hidden />
            {executing ? '处理中…' : `开始导入（${summary.pending}）`}
          </button>
          <span className="text-[12px] text-apple-text-3">逐条执行，重复卡密自动跳过</span>
        </div>
      )}

      {/* 进度 */}
      {progress && (
        <div className="mt-4 rounded-card border border-apple-border bg-apple-card p-4 shadow-card">
          <div className="flex items-center justify-between text-[13px] text-apple-text-2">
            <span>
              正在处理 {progress.done}/{progress.total}：{progress.name}
            </span>
            <span className="tabular-nums">{Math.round((progress.done / progress.total) * 100)}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-apple-border">
            <div
              className="h-full rounded-full bg-apple-blue transition-all duration-150"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 结果报告 */}
      {results.length > 0 && !executing && (
        <div className="mt-4 rounded-card border border-apple-border bg-apple-card p-5 shadow-card">
          <p className="text-[15px] font-semibold text-apple-text">
            执行完成：成功 {results.filter((r) => r.status === 'ok').length} ·
            跳过 {results.filter((r) => r.status === 'skipped').length} ·
            失败 {results.filter((r) => r.status === 'error').length}
          </p>
          <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
            {results.map((r) => (
              <li key={r.name} className="flex items-start gap-2 text-[13px]">
                <span className="mt-0.5 shrink-0">
                  {r.status === 'ok' ? (
                    <Badge tone="green">成功</Badge>
                  ) : r.status === 'skipped' ? (
                    <Badge tone="amber">跳过</Badge>
                  ) : (
                    <Badge tone="red">失败</Badge>
                  )}
                </span>
                <span className="leading-relaxed text-apple-text">
                  <span className="font-medium">{r.name}</span>：{r.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Notice notice={notice} />
    </>
  );
}

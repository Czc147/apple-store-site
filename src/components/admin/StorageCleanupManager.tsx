'use client';

import { useState } from 'react';
import { RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { adminFetch, extractError } from '@/lib/admin-fetch';
import { PageHeader, Notice, btnPrimary, btnGhost, btnDanger } from '@/components/admin/ui';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

interface Candidate {
  bucket: string;
  fullPath: string;
  bytes: number;
  createdAt: string | null;
}

interface PreviewResult {
  mode: 'preview';
  scanned: number;
  scannedBytes: number;
  referenced: number;
  referencedBytes: number;
  orphanCount: number;
  orphanBytes: number;
  candidates: Candidate[];
}

interface ExecuteResult {
  mode: 'execute';
  deleted: number;
  deletedBytes: number;
  errors: string[];
}

const fmtBytes = (n: number) => {
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
};

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '—';

/** 后台「存储清理」：扫描并删除未被任何内容表引用的孤儿文件（14 天门槛保护刚上传未保存的内容） */
export default function StorageCleanupManager() {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [execute, setExecute] = useState<ExecuteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const scan = async (mode: 'preview' | 'execute') => {
    setLoading(true);
    setNotice(null);
    try {
      const res = await adminFetch('/api/admin/cleanup-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      const data = (await res.json()) as PreviewResult | ExecuteResult;
      if (data.mode === 'execute') {
        const e = data as ExecuteResult;
        setExecute(e);
        setPreview(null);
        setNotice({
          ok: e.errors.length === 0,
          text: e.errors.length
            ? `已删除 ${e.deleted} 个，${e.errors.length} 处失败`
            : `已删除 ${e.deleted} 个文件（${fmtBytes(e.deletedBytes)}）`,
        });
      } else {
        setExecute(null);
        setPreview(data as PreviewResult);
      }
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : '扫描失败' });
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    setConfirmOpen(false);
    await scan('execute');
  };

  const candidates = preview?.candidates ?? [];

  return (
    <div>
      <PageHeader
        title="存储清理"
        description="扫描 Supabase Storage，列出并删除未被库中任何内容引用的孤儿文件（仅删除上传满 14 天且未在库中登记的对象）"
      />

      <div className="mb-4 flex items-start gap-2 rounded-card border border-apple-border bg-apple-card p-4 shadow-card">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-apple-text-3" aria-hidden />
        <p className="text-[13px] leading-relaxed text-apple-text-2">
          这是一个安全清理：只有「没被任何内容表引用」且「已上传超过 14 天」的文件才会被列为候选。
          正在被站内引用的图片、封面、仓库内容绝不会被删除。清理前请先「扫描预览」，确认无误后再删除。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={btnPrimary}
          onClick={() => void scan('preview')}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          扫描孤儿文件
        </button>
        {preview && preview.orphanCount > 0 && (
          <button
            type="button"
            className={btnDanger}
            onClick={() => setConfirmOpen(true)}
            disabled={loading}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            确认删除 {preview.orphanCount} 个
          </button>
        )}
      </div>

      {preview && (
        <div className="mt-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="扫描总数" value={String(preview.scanned)} />
            <Metric label="被引用" value={`${preview.referenced} 个`} sub={fmtBytes(preview.referencedBytes)} />
            <Metric label="孤儿候选" value={`${preview.orphanCount} 个`} tone="amber" />
            <Metric label="可释放" value={fmtBytes(preview.orphanBytes)} tone="red" />
          </div>

          {candidates.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-card border border-apple-border bg-apple-card shadow-card">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap border-b border-apple-hairline px-4 py-3 text-left text-[12px] font-medium text-apple-text-3">桶</th>
                    <th className="whitespace-nowrap border-b border-apple-hairline px-4 py-3 text-left text-[12px] font-medium text-apple-text-3">对象路径</th>
                    <th className="whitespace-nowrap border-b border-apple-hairline px-4 py-3 text-left text-[12px] font-medium text-apple-text-3">大小</th>
                    <th className="whitespace-nowrap border-b border-apple-hairline px-4 py-3 text-left text-[12px] font-medium text-apple-text-3">上传时间</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.bucket + '/' + c.fullPath}>
                      <td className="border-b border-apple-hairline px-4 py-3 text-[13px] text-apple-text-2">{c.bucket}</td>
                      <td className="border-b border-apple-hairline px-4 py-3 text-[13px] font-mono text-apple-text">{c.fullPath}</td>
                      <td className="border-b border-apple-hairline px-4 py-3 text-[13px] tabular-nums text-apple-text-2">{fmtBytes(c.bytes)}</td>
                      <td className="border-b border-apple-hairline px-4 py-3 text-[13px] text-apple-text-2">{fmtDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4 rounded-card border border-apple-border bg-apple-card p-8 text-center shadow-card">
              <p className="text-[14px] text-apple-text-2">
                {preview.scanned > 0 ? '未发现孤儿文件，存储很干净。' : '扫描完成，未发现对象。'}
              </p>
            </div>
          )}
        </div>
      )}

      {execute && (
        <div className="mt-4 rounded-card border border-apple-border bg-apple-card p-5 shadow-card">
          <p className="text-[14px] font-medium text-apple-text">
            本次删除 {execute.deleted} 个文件（{fmtBytes(execute.deletedBytes)}）
          </p>
          {execute.errors.length > 0 && (
            <ul className="mt-3 space-y-1">
              {execute.errors.map((e, i) => (
                <li key={i} className="text-[13px] text-[#B80012]">{e}</li>
              ))}
            </ul>
          )}
          <button type="button" className={`${btnGhost} mt-3`} onClick={() => void scan('preview')}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            重新扫描确认
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="确认删除孤儿文件"
        message={`确定要永久删除 ${preview?.orphanCount ?? 0} 个未被引用的文件（${fmtBytes(preview?.orphanBytes ?? 0)}）吗？此操作不可撤销。`}
        note="仅删除未被引用的孤儿文件；正在展示的内容不受影响。"
        confirmText="确认删除"
        busy={loading}
        onConfirm={() => void confirmDelete()}
        onClose={() => setConfirmOpen(false)}
      />

      <Notice notice={notice} />
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'amber' | 'red';
}) {
  const toneCls =
    tone === 'red'
      ? 'bg-[#FDECEE] text-[#B80012]'
      : tone === 'amber'
        ? 'bg-[#FFF4E0] text-[#8A6100]'
        : 'bg-apple-blue-soft text-apple-blue';
  return (
    <div className="rounded-card border border-apple-border bg-apple-card p-4 shadow-card">
      <p className="text-[12px] font-medium text-apple-text-2">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[13px] font-bold tabular-nums ${toneCls}`}>
          {value}
        </span>
      </div>
      {sub && <p className="mt-1.5 text-[12px] text-apple-text-3">{sub}</p>}
    </div>
  );
}

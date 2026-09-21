'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { adminFetch, extractError } from '@/lib/admin-fetch';

/** 批量操作结果（POST /api/admin/bulk-delete） */
export interface BulkResult {
  requested: number;
  deleted: number;
  voided: number;
  failed: Array<{ id: string; error: string }>;
}

/**
 * 行勾选状态（各 Manager 共用）：
 * - 选中集合是「当前列表里仍存在」的 id 子集：翻页 / 筛选 / 删完刷新后自动收敛，
 *   不会把上一页的选中带到下一页
 * - 全选 = 当前列表全选（分页列表即当前页）
 */
export function useBulkSelect(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const key = ids.join(',');

  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const alive = new Set(ids);
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const allSelected = ids.length > 0 && selected.size === ids.length;
  const someSelected = selected.size > 0 && !allSelected;

  return useMemo(
    () => ({
      selected,
      allSelected,
      someSelected,
      toggle(id: string) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      },
      toggleAll() {
        setSelected((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
      },
      clear() {
        setSelected(new Set());
      },
    }),
    // ids 由调用方的列表派生，key 变化时上面的 effect 已收敛选中集
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, ids.join(',')],
  );
}

/** 表头全选框（半选态用 indeterminate，React 不支持直接传属性，需 ref 同步） */
export function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 accent-apple-blue"
    />
  );
}

/** 行选框 */
export function RowCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 accent-apple-blue"
    />
  );
}

export interface BulkAction {
  /** React key */
  key: string;
  text: string;
  /** danger = 红色（删除类）；默认蓝色文字 */
  danger?: boolean;
  onClick: () => void;
}

/**
 * 底部批量操作条：有选中项时浮在列表底部（固定居中，含遮罩下层不挡操作）。
 * 与后台其它浮层一致走 z-panel（低于 Notice 的 z-[70]）。
 */
export function BulkBar({
  count,
  noun,
  actions,
  busy,
  onClear,
}: {
  count: number;
  /** 条目量词文案，如「条卡密」「个帖子」 */
  noun: string;
  actions: BulkAction[];
  busy?: boolean;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-panel -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border border-apple-border bg-apple-card px-2 py-1.5 shadow-popover">
        <span className="px-3 text-[13px] font-medium text-apple-text">
          已选 <span className="tabular-nums">{count}</span> {noun}
        </span>
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={a.onClick}
            disabled={busy}
            className={`inline-flex h-8 items-center rounded-full px-3 text-[13px] font-medium transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
              a.danger
                ? 'bg-[#D70015] text-white hover:bg-[#B80012]'
                : 'text-apple-blue hover:bg-apple-blue-soft/60'
            }`}
          >
            {a.text}
          </button>
        ))}
        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          aria-label="取消选择"
          className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-apple-text-3 transition hover:bg-apple-bg hover:text-apple-text disabled:opacity-40"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** 批量结果一句话（成功/失败计数；作废操作的主计数是 voided，其余是 deleted） */
export function bulkResultText(r: BulkResult, verb: string): string {
  const main = verb === '作废' ? r.voided : r.deleted;
  let text = `已${verb} ${main} 条`;
  if (verb !== '作废' && r.voided > 0) text += `（并作废 ${r.voided} 把卡密）`;
  if (r.failed.length > 0) text += ` · ${r.failed.length} 条未处理：${r.failed[0].error}`;
  return text;
}

/**
 * 批量请求：POST /api/admin/bulk-delete，返回结果或抛错。
 * 各 Manager 的批量条统一走它，避免每处重复拼 fetch。
 */
export async function bulkDelete(
  resource: string,
  ids: string[],
  op?: 'delete' | 'void' | 'revoke',
): Promise<BulkResult> {
  const res = await adminFetch('/api/admin/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resource, ids, op }),
  });
  if (!res.ok) throw new Error(await extractError(res));
  return (await res.json()) as BulkResult;
}


import type { ReactNode } from 'react';
import { ExternalLink, Image as ImageIcon } from 'lucide-react';

/** 后台通用样式常量与原子组件（Apple 风格，沿用前台设计令牌） */

/* 表单控件 12px 圆角（对齐 Apple 输入框规范） */
export const inputCls =
  'h-10 w-full rounded-xl border border-apple-border bg-white px-3 text-[14px] text-apple-text outline-none transition focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 disabled:bg-apple-bg';

export const textareaCls =
  'w-full rounded-xl border border-apple-border bg-white px-3 py-2 text-[14px] leading-relaxed text-apple-text outline-none transition focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20';

export const selectCls =
  'h-10 w-full appearance-none rounded-xl border border-apple-border bg-white px-3 pr-8 text-[14px] text-apple-text outline-none transition focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20';

/* CTA 按钮：980px 胶囊 · 按压 100ms · 颜色过渡 200ms */
export const btnPrimary =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-btn bg-apple-blue px-5 text-[14px] font-medium text-white hover:bg-apple-blue-hover active:scale-[0.98] [transition:transform_100ms_cubic-bezier(0.4,0,0.2,1),background-color_200ms_cubic-bezier(0.4,0,0.2,1),opacity_200ms_cubic-bezier(0.4,0,0.2,1)] disabled:pointer-events-none disabled:opacity-50';

export const btnGhost =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-btn border border-apple-border bg-white px-5 text-[14px] font-medium text-apple-text hover:bg-apple-bg active:scale-[0.98] [transition:transform_100ms_cubic-bezier(0.4,0,0.2,1),background-color_200ms_cubic-bezier(0.4,0,0.2,1),opacity_200ms_cubic-bezier(0.4,0,0.2,1)] disabled:pointer-events-none disabled:opacity-50';

export const btnDanger =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-btn bg-[#D70015] px-5 text-[14px] font-medium text-white hover:bg-[#B80012] active:scale-[0.98] [transition:transform_100ms_cubic-bezier(0.4,0,0.2,1),background-color_200ms_cubic-bezier(0.4,0,0.2,1),opacity_200ms_cubic-bezier(0.4,0,0.2,1)] disabled:pointer-events-none disabled:opacity-50';

export const thCls =
  'whitespace-nowrap border-b border-apple-hairline px-4 py-3 text-left text-[12px] font-medium text-apple-text-3';

export const tdCls =
  'border-b border-apple-hairline px-4 py-3 align-middle text-[14px] text-apple-text';

/** 表单字段容器：label + 控件 + 提示文字 */
export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-0.5 text-[13px] font-medium text-apple-text">
        {label}
        {required && <span className="text-[#D70015]">*</span>}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[12px] leading-relaxed text-apple-text-3">
          {hint}
        </span>
      )}
    </label>
  );
}

/** 表格容器：圆角卡片 + 移动端横向滚动 */
export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-apple-border bg-apple-card shadow-card">
      <table className="w-full min-w-[680px] border-collapse text-left">
        {children}
      </table>
    </div>
  );
}

/** 轻量提示条（成功/失败反馈，固定底部居中） */
export function Notice({
  notice,
}: {
  notice: { ok: boolean; text: string } | null;
}) {
  if (!notice) return null;
  return (
    <div
      role="status"
      className={`fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium text-white shadow-popover ${
        notice.ok ? 'bg-apple-text' : 'bg-[#D70015]'
      }`}
    >
      {notice.text}
    </div>
  );
}

/** 表格内 48px 图片缩略图（无图显示占位图标） */
export function Thumb({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-apple-hairline bg-apple-bg text-apple-text-3">
        <ImageIcon className="h-4 w-4" aria-hidden />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="h-12 w-12 rounded-lg border border-apple-hairline object-cover"
      loading="lazy"
    />
  );
}

/** 表格内链接单元格：截断展示，点击新标签页打开 */
export function LinkCell({ href }: { href: string | null }) {
  if (!href) return <span className="text-apple-text-3">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      className="inline-flex max-w-[220px] items-center gap-1 text-[13px] text-apple-blue hover:underline"
    >
      <span className="truncate">{href}</span>
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
    </a>
  );
}

/** 表格加载占位行 */
export function LoadingRows({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className={tdCls}>
        <div className="flex flex-col gap-2 py-2">
          <div className="skeleton h-4 w-full rounded-md" />
          <div className="skeleton h-4 w-3/4 rounded-md" />
        </div>
      </td>
    </tr>
  );
}

/** 表格空数据行（带新增引导） */
export function EmptyRow({
  colSpan,
  text,
  createLabel,
  onCreate,
}: {
  colSpan: number;
  text: string;
  createLabel?: string;
  onCreate?: () => void;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center">
        <p className="text-[14px] text-apple-text-2">{text}</p>
        {createLabel && onCreate && (
          <button type="button" onClick={onCreate} className={`${btnPrimary} mt-4`}>
            {createLabel}
          </button>
        )}
      </td>
    </tr>
  );
}

/** 行内操作按钮组 */
export function RowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onEdit}
        className="text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
      >
        编辑
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-[13px] font-medium text-[#D70015] transition hover:opacity-80"
      >
        删除
      </button>
    </div>
  );
}

/** 管理页标题栏：标题 + 描述 + 右侧新增按钮 */
export function PageHeader({
  title,
  description,
  createLabel,
  onCreate,
}: {
  title: string;
  description: string;
  createLabel: string;
  onCreate: () => void;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-bold leading-tight text-apple-text">
          {title}
        </h1>
        <p className="mt-1 text-[13px] text-apple-text-2">{description}</p>
      </div>
      <button type="button" onClick={onCreate} className={btnPrimary}>
        <span className="text-[16px] leading-none" aria-hidden>
          ＋
        </span>
        {createLabel}
      </button>
    </header>
  );
}

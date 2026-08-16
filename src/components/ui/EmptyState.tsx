import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** 页面空态占位（后续步骤逐个替换为真实内容） */
export default function EmptyState({
  icon: Icon,
  title,
  description,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-8 pb-16 pt-32 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-apple-card shadow-card">
        <Icon className="h-7 w-7 text-apple-text-3" strokeWidth={1.6} aria-hidden />
      </div>
      <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-[300px] text-[13px] leading-relaxed text-apple-text-2">
        {description}
      </p>
    </div>
  );
}

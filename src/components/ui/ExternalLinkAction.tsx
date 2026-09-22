import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface ExternalLinkActionProps {
  href: string;
  className?: string;
  children: ReactNode;
}

/**
 * 「打开 X」外链行内动作（audit 收敛：同构写法 ×6 处复制）。
 * 负外边距 + padding 垂直扩命中区，不吃周边布局。
 */
export default function ExternalLinkAction({ href, className, children }: ExternalLinkActionProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        '-my-1.5 inline-flex items-center gap-1 py-1.5 text-sm font-medium text-apple-blue',
        'pressable hover:text-apple-blue-hover',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40 focus-visible:ring-offset-2',
        className,
      )}
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5 flex-none" aria-hidden />
    </a>
  );
}

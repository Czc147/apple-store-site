import { cn } from '@/lib/cn';

/** 超过这个行数就折起来（UI.docx 第 35 条：默认最多 5 行） */
export const COLLAPSE_LINES = 5;

/** 正文里的 @提及 / #话题 / 链接。链接必须带协议，否则把「3.14」也算进去了 */
const TOKEN_RE = /(@[\w.-]+|#[\w一-龥]+|https?:\/\/[^\s]+)/g;

/**
 * 帖子正文（UI.docx 的 PostContent）。
 *
 * 三处与文档示意实现的差别：
 * - **链接渲染成真 `<a>`**，而不是文档里那种只有样式、点了没反应的 `<span>`。
 *   `rel="noopener noreferrer nofollow"` 是必须的：帖子内容由用户产生，
 *   不隔离的话 `window.opener` 能被新页面反向操纵。
 * - **@提及与 #话题保持为纯样式文本**，不做成链接 —— 我们既没有用户主页
 *   也没有话题聚合页，做成可点的样子却点不动更糟。以后有了再补 `href`。
 * - 折行用 `overflow-wrap: anywhere`（Tailwind 的 `break-words` 不够，
 *   连续长串如链接会撑破容器）。
 */
export default function PostContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  if (!content) return null;

  const parts = content.split(TOKEN_RE);

  return (
    <p
      className={cn(
        'whitespace-pre-wrap text-editorial leading-relaxed text-apple-text [overflow-wrap:anywhere]',
        className,
      )}
    >
      {parts.map((part, i) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-apple-blue underline-offset-2 hover:underline"
            >
              {part}
            </a>
          );
        }
        if (/^[@#]/.test(part)) {
          return (
            <span key={i} className="font-medium text-apple-blue">
              {part}
            </span>
          );
        }
        return part;
      })}
    </p>
  );
}

'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import Button from '@/components/ui/Button';
import Surface from '@/components/ui/Surface';

interface NewPostComposerProps {
  isLoggedIn: boolean;
  onSubmit: (content: string) => Promise<boolean>;
}

/**
 * 发帖输入框：纯文本；未登录只读并提示去登录。
 * audit 收敛：textarea 材质与评论输入统一（bg-apple-bg 填充式 + 方案 A focus）；
 * 发布钮手抄类串 → Button primitive（disabled/loading 语义内建）；计数 11.5px → 2xs。
 */
export default function NewPostComposer({
  isLoggedIn,
  onSubmit,
}: NewPostComposerProps) {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const content = draft.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    const okPost = await onSubmit(content);
    setSubmitting(false);
    if (okPost) setDraft('');
  };

  return (
    <Surface radius="card" className="p-3">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        readOnly={!isLoggedIn}
        placeholder={isLoggedIn ? '分享点什么吧…' : '登录后即可发帖'}
        rows={2}
        aria-label="发帖内容"
        maxLength={2000}
        className="w-full resize-none rounded-input border border-transparent bg-apple-bg px-3.5 py-2.5 text-md leading-relaxed text-apple-text outline-none transition duration-fast ease-apple placeholder:text-apple-text-3 focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-2xs text-apple-text-3">
          {draft.length > 0 ? `${draft.length}/2000` : ''}
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void submit()}
          disabled={!isLoggedIn || submitting || !draft.trim()}
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
          {submitting ? '发布中…' : '发布'}
        </Button>
      </div>
    </Surface>
  );
}

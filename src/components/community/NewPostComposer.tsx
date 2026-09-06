'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';

interface NewPostComposerProps {
  isLoggedIn: boolean;
  onSubmit: (content: string) => Promise<boolean>;
}

/** 发帖输入框：纯文本；未登录只读并提示去登录 */
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
    <div className="rounded-card border border-apple-border bg-apple-card p-3 shadow-card">
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
        className="w-full resize-none rounded-card border border-apple-hairline bg-apple-surface px-3 py-2 text-[14px] leading-relaxed text-apple-text outline-none transition placeholder:text-apple-text-3 focus:border-apple-blue"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11.5px] text-apple-text-3">
          {draft.length > 0 ? `${draft.length}/2000` : ''}
        </span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!isLoggedIn || submitting || !draft.trim()}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-btn bg-apple-blue px-4 text-[13.5px] font-medium text-white transition active:scale-95 disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
          发布
        </button>
      </div>
    </div>
  );
}

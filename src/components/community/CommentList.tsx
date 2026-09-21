'use client';

import { useEffect, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import {
  addComment,
  deleteComment,
  fetchComments,
  type CommunityComment,
} from '@/lib/community';
import Avatar from '@/components/ui/Avatar';
import { timeAgo } from '@/lib/format';

interface CommentListProps {
  postId: string;
  currentUserId: string | null;
  getAuthHeaders: () => Promise<Record<string, string>>;
  isLoggedIn: boolean;
  /** 新增评论后回调，供上级 +1 评论数 */
  onAdded: (postId: string) => void;
  /** 删除评论后回调，供上级 -1 评论数 */
  onDeleted: (postId: string) => void;
}

/**
 * 某帖的评论区：列表 + 输入行；评论作者可删除自己的评论。
 * audit 收敛：气泡 rounded-card(20px 用在 30px 小元素) → rounded-input；
 * 删除钮 ~16px / 发送钮 36px 命中 → 44pt；输入框 focus 方案 B(仅边框) →
 * 方案 A(边框+ring)；材质统一 bg-apple-bg 填充式；日期 → timeAgo。
 * UI 升级 §8.5：评论正文升到正文档（14px）+ 宽松行距、气泡内边距放宽，
 * 阅读层级 = 作者/时间（灰）→ 正文（深色）；不放玻璃、不加装饰。
 */
export default function CommentList({
  postId,
  currentUserId,
  getAuthHeaders,
  isLoggedIn,
  onAdded,
  onDeleted,
}: CommentListProps) {
  const [comments, setComments] = useState<CommunityComment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchComments(getAuthHeaders, postId).then((list) => {
      if (alive) setComments(list ?? []);
    });
    return () => {
      alive = false;
    };
  }, [postId, getAuthHeaders]);

  const submit = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    const okPost = await addComment(getAuthHeaders, postId, content);
    setSending(false);
    if (!okPost) return;
    setDraft('');
    const list = await fetchComments(getAuthHeaders, postId);
    setComments(list ?? []);
    onAdded(postId);
  };

  const remove = async (commentId: string) => {
    const ok = await deleteComment(getAuthHeaders, postId, commentId);
    if (!ok) return;
    setComments((prev) => (prev ?? []).filter((c) => c.id !== commentId));
    onDeleted(postId);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {(comments ?? []).length === 0 && (
          <p className="py-1 text-center text-xs text-apple-text-3">
            还没有评论，来抢沙发吧
          </p>
        )}
        {(comments ?? []).map((c) => (
          <div key={c.id} className="rounded-input bg-apple-bg px-3.5 py-2.5">
            <div className="flex items-center gap-1.5 text-2xs text-apple-text-3">
              <Avatar
                avatarKey={c.author?.avatar_key}
                avatarUrl={c.author?.avatar_url}
                name={c.author?.display_name ?? c.user_email}
                size={18}
              />
              <span className="font-medium text-apple-text-2">
                {c.author?.display_name ?? (c.user_email ? c.user_email.split('@')[0] : '用户')}
              </span>
              <span aria-hidden>·</span>
              <span>{timeAgo(c.created_at)}</span>
              {currentUserId && c.user_id === currentUserId && (
                <button
                  type="button"
                  onClick={() => void remove(c.id)}
                  aria-label="删除评论"
                  className="-my-2.5 -mr-2 ml-auto inline-flex min-h-11 items-center gap-1 rounded-btn px-2 text-2xs text-apple-text-3 transition-colors duration-fast ease-apple hover:text-apple-danger active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-danger/40"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  删除
                </button>
              )}
            </div>
            <p className="mt-1 break-words whitespace-pre-wrap text-base leading-relaxed text-apple-text">
              {c.content}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
          placeholder={isLoggedIn ? '写下你的评论…' : '登录后可评论'}
          readOnly={!isLoggedIn}
          aria-label="评论输入"
          className="h-11 min-w-0 flex-1 rounded-btn border border-transparent bg-apple-bg px-4 text-sm text-apple-text outline-none transition duration-fast ease-apple placeholder:text-apple-text-3 focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!isLoggedIn || sending || !draft.trim()}
          aria-label="发送评论"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-apple-blue text-white shadow-btn-blue transition-[background-color,transform] duration-base ease-apple hover:bg-apple-blue-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-apple-border disabled:text-apple-text-3 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40 focus-visible:ring-offset-2"
        >
          <Send className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>
    </div>
  );
}

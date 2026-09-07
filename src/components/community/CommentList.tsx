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

/** 某帖的评论区：当前用户 + 新评论输入 + 发送；作者可删除自己的评论 */
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
          <p className="text-[12.5px] text-apple-text-3">还没有评论，来抢沙发吧</p>
        )}
        {(comments ?? []).map((c) => (
          <div key={c.id} className="rounded-card bg-apple-bg px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] text-apple-text-3">
              <Avatar
                avatarKey={c.author?.avatar_key}
                avatarUrl={c.author?.avatar_url}
                name={c.author?.display_name ?? c.user_email}
                size={18}
              />
              <span className="font-medium text-apple-text-2">
                {c.author?.display_name ?? (c.user_email ? c.user_email.split('@')[0] : '用户')}
              </span>
              <span>·</span>
              <span>{new Date(c.created_at).toLocaleDateString('zh-CN')}</span>
              {currentUserId && c.user_id === currentUserId && (
                <button
                  type="button"
                  onClick={() => void remove(c.id)}
                  aria-label="删除评论"
                  className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-apple-text-3 transition hover:text-red-500 active:scale-95"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  删除
                </button>
              )}
            </div>
            <p className="mt-1 break-words whitespace-pre-wrap text-[13.5px] leading-relaxed text-apple-text">
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
          className="h-9 min-w-0 flex-1 rounded-btn border border-apple-hairline bg-apple-card px-3 text-[13.5px] text-apple-text outline-none transition focus:border-apple-blue"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!isLoggedIn || sending || !draft.trim()}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-apple-blue text-white transition active:scale-95 disabled:opacity-40"
          aria-label="发送评论"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

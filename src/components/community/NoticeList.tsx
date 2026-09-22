'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { fetchCommunity, type CommunityPost } from '@/lib/community';
import Badge from '@/components/ui/Badge';
import DataError from '@/components/ui/DataError';
import EmptyState from '@/components/ui/EmptyState';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import PostImages from './PostImages';

/**
 * 探究页的官方公告列表（2026-09-22 用户拍板：**帖子流整个搬到广场**）。
 *
 * 所以这一页只剩官方置顶通知，不再有发帖框、点赞、评论 —— 那些都在
 * 广场的「交流」板块里。刻意不复用 PostCard：那张卡带操作行与删除入口，
 * 用在只读公告上会误导用户以为能互动。
 *
 * 只显示 is_pinned 的帖子：用户帖无论热度都不进这里，避免这页又长成一个信息流。
 */
export default function NoticeList() {
  const { getAuthHeaders } = useAuth();
  const [notices, setNotices] = useState<CommunityPost[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    const list = await fetchCommunity(getAuthHeaders);
    if (list === null) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setNotices(list.filter((p) => p.is_pinned));
  }, [getAuthHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadFailed && notices === null) {
    return (
      <DataError
        message="公告加载失败，请检查网络后重试"
        onRetry={() => void load()}
        size="inline"
      />
    );
  }

  if (notices === null) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite" aria-label="公告加载中">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-card-lg bg-apple-card p-4 sm:p-5">
            <div className="skeleton h-3.5 w-28 rounded-full" />
            <div className="mt-3 space-y-2">
              <div className="skeleton h-4 w-full rounded-full" />
              <div className="skeleton h-4 w-3/4 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (notices.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title="暂无公告"
        description="有新的通知会出现在这里。"
      />
    );
  }

  return (
    <div className="space-y-3">
      {notices.map((n) => (
        <NoticeCard key={n.id} notice={n} />
      ))}
    </div>
  );
}

function NoticeCard({ notice }: { notice: CommunityPost }) {
  const isOfficial = !notice.user_id;
  return (
    <article className="rounded-card-lg bg-apple-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-7 w-7 flex-none items-center justify-center rounded-full',
            isOfficial ? 'bg-apple-blue-soft' : 'bg-apple-bg',
          )}
        >
          <Megaphone
            className={cn(
              'h-3.5 w-3.5',
              isOfficial ? 'text-apple-blue' : 'text-apple-text-3',
            )}
            aria-hidden
          />
        </span>
        <span className="text-base font-semibold text-apple-text">
          {isOfficial ? 'Zorvin 官方' : (notice.user_email?.split('@')[0] ?? '用户')}
        </span>
        {isOfficial && (
          <Badge tone="blue" size="sm">
            官方
          </Badge>
        )}
        <span className="ml-auto text-2xs text-apple-text-3">
          {timeAgo(notice.created_at)}
        </span>
      </div>

      {notice.content && (
        <p className="mt-3 break-words whitespace-pre-wrap text-editorial leading-relaxed text-apple-text">
          {notice.content}
        </p>
      )}

      <PostImages images={notice.images} />
    </article>
  );
}

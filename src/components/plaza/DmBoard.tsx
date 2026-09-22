'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bookmark, Check, MessageCircle, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import Avatar from '@/components/ui/Avatar';
import Orbi from '@/components/orbi/Orbi';
import EmptyState from '@/components/ui/EmptyState';
import DataError from '@/components/ui/DataError';
import Button from '@/components/ui/Button';
import BottomSheet from '@/components/ui/BottomSheet';
import RegisterBanner from '@/components/ui/RegisterBanner';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  OFFICIAL_PEER_ID,
  fetchFriends,
  fetchThreads,
  hideDmThread,
  removeFriend,
  respondFriend,
  type DmThread,
  type FriendEntry,
  type FriendsResponse,
} from '@/lib/dm';
import DmThreadView from './DmThread';
import BookmarksThread from './BookmarksThread';
import SwipeToDelete from './SwipeToDelete';

/** 官方会话的合成条目：一条消息都没有时也要常驻在列表顶部 */
const OFFICIAL_THREAD: DmThread = {
  peer_id: OFFICIAL_PEER_ID,
  is_official: true,
  last_content: '',
  last_at: '',
  last_from_me: false,
  unread_count: 0,
  author: null,
};

/**
 * 对话板块：官方入口 + 好友会话 + 待处理的好友申请。
 *
 * - **官方会话固定在顶部**（用户要求"顶栏固定官方对话入口"）：不依赖
 *   "有消息才出现"，否则新用户进来看不到官方入口，也就无从发起第一条留言。
 * - 好友来自「交流」板块点作者头像加好友，这里只负责同意/拒绝与聊天。
 * - 未登录时只显示注册引导，不拉任何数据。
 */
export default function DmBoard({
  onFullscreenChange,
  intent = null,
  onIntentHandled,
}: {
  /**
   * 打开某个会话时通知外层收起广场标题栏。
   * 会话视图要占满一屏，上面再压一行「对话 / 和好友聊天…」既挤又重复
   * （会话自己的顶栏已经写了对方是谁）。
   */
  onFullscreenChange?: (fullscreen: boolean) => void;
  /**
   * 外层要求直达的视图（目前只有总设置里的「我的收藏」）。
   * 本板块持有收藏的开关状态，外面点不到，所以用意图传进来。
   */
  intent?: 'bookmarks' | null;
  /** 意图已消费，外层清掉，免得下次再进来又自动弹一次 */
  onIntentHandled?: () => void;
} = {}) {
  const { user, loading, getAuthHeaders } = useAuth();
  const [threads, setThreads] = useState<DmThread[] | null>(null);
  const [friends, setFriends] = useState<FriendsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [openThread, setOpenThread] = useState<DmThread | null>(null);
  /** 「我的收藏」也是对话列表里的一条，但它不是 DM，单独一个开关 */
  const [openBookmarks, setOpenBookmarks] = useState(false);
  /**
   * 我删过聊天记录的对端（迁移 030）。
   * 删完之后消息没了、但好友关系还在 —— 没有这个名单的话，
   * 「好友但没消息」那条腿会立刻把同一行补回来，用户看到的就是"删了还在"。
   */
  const [hiddenPeers, setHiddenPeers] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  /** 当前左滑展开的那一行（同一时刻只允许一行展开，所以放父级） */
  const [swipedId, setSwipedId] = useState<string | null>(null);
  /** 待确认「删除聊天记录」的会话（不可撤销，所以先问一句） */
  const [confirmHide, setConfirmHide] = useState<DmThread | null>(null);
  const [hiding, setHiding] = useState(false);
  /** 一次性提示（失败原因 / 删完的结果）—— 以前删除失败是完全没有反馈的 */
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(t);
  }, [notice]);

  // 消费外层意图：登录态还没读完时先等着，否则会被"未登录"分支吞掉
  useEffect(() => {
    if (intent !== 'bookmarks' || loading) return;
    if (user) setOpenBookmarks(true);
    onIntentHandled?.();
  }, [intent, loading, user, onIntentHandled]);

  const loadAll = useCallback(async () => {
    const [t, f] = await Promise.all([
      fetchThreads(getAuthHeaders),
      fetchFriends(getAuthHeaders),
    ]);
    if (t === null && f === null) {
      setFailed(true);
      return;
    }
    setFailed(false);
    if (t) {
      setThreads(t.threads);
      setHiddenPeers(new Set(t.hiddenPeers));
    }
    if (f) setFriends(f);
  }, [getAuthHeaders]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setThreads(null);
      setFriends(null);
      setHiddenPeers(new Set());
      return;
    }
    void loadAll();
  }, [loading, user?.id, loadAll]);

  // 切板块或离开时要把标题栏还回去，否则广场会一直顶着没有标题的状态
  useEffect(() => {
    onFullscreenChange?.(Boolean(openThread) || openBookmarks);
    return () => onFullscreenChange?.(false);
  }, [openThread, openBookmarks, onFullscreenChange]);

  const handleRespond = async (entry: FriendEntry, action: 'accept' | 'reject') => {
    setBusyId(entry.id);
    const ok = await respondFriend(getAuthHeaders, entry.id, action);
    setBusyId(null);
    if (ok) await loadAll();
  };

  const handleRemove = async (entry: FriendEntry) => {
    setBusyId(entry.id);
    const ok = await removeFriend(getAuthHeaders, entry.id);
    setBusyId(null);
    if (ok) await loadAll();
  };

  /**
   * 按 peer 删好友（只用于「没有聊天记录的好友」那一行）。
   *
   * 旧代码是 `if (entry) void handleRemove(entry)` —— 找不到好友关系就**静默跳过**，
   * 用户点了删除什么也没发生、也没有任何提示，根本分不清是卡了还是删不掉。
   * 现在至少把原因说出来（找不到关系就让人刷新，而不是假装点了）。
   */
  const handleRemoveByPeer = async (peerId: string) => {
    const entry = friends?.friends.find((f) => f.user_id === peerId);
    if (!entry) {
      setNotice('找不到这条好友关系，请刷新后重试');
      return;
    }
    await handleRemove(entry);
  };

  /** 删除聊天记录：只对我隐藏（迁移 030），对方的记录不动 */
  const handleHide = async (thread: DmThread) => {
    setHiding(true);
    const res = await hideDmThread(getAuthHeaders, thread.peer_id);
    setHiding(false);
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    setConfirmHide(null);
    await loadAll();
    setNotice('已删除聊天记录，对方那边不受影响');
  };

  if (loading) {
    return <p className="py-10 text-center text-sm text-apple-text-3">加载中…</p>;
  }

  if (!user) {
    return (
      <RegisterBanner className="mx-auto max-w-wide" />
    );
  }

  if (openBookmarks) {
    return (
      <BookmarksThread
        getAuthHeaders={getAuthHeaders}
        onBack={() => setOpenBookmarks(false)}
      />
    );
  }

  if (openThread) {
    return (
      <DmThreadView
        thread={openThread}
        getAuthHeaders={getAuthHeaders}
        onBack={() => setOpenThread(null)}
        onChanged={() => void loadAll()}
      />
    );
  }

  if (failed && threads === null && friends === null) {
    return (
      <DataError
        message="对话加载失败，请检查网络后重试"
        onRetry={() => void loadAll()}
        size="inline"
      />
    );
  }

  if (threads === null || friends === null) {
    return (
      <div className="mx-auto max-w-wide space-y-3" aria-busy="true" aria-label="对话加载中">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-16 w-full rounded-card-lg" />
        ))}
      </div>
    );
  }

  // 官方会话固定置顶：列表里有就用列表里的（带最后一条/未读），没有就补一条空的
  const official =
    threads.find((t) => t.is_official) ?? OFFICIAL_THREAD;
  const friendThreads = threads.filter((t) => !t.is_official);

  // 还没聊过的好友也要能点进去（否则加完好友找不到人说话）。
  // 但要排掉「我刚删过记录」的那些：他们不是没聊过，是我主动清掉了 ——
  // 留着这一行等于删了个寂寞（对方再发消息时 thread 腿会把他带回来）。
  const chattedPeerIds = new Set(friendThreads.map((t) => t.peer_id));
  const silentFriends: DmThread[] = friends.friends
    .filter((f) => !chattedPeerIds.has(f.user_id) && !hiddenPeers.has(f.user_id))
    .map((f) => ({
      peer_id: f.user_id,
      is_official: false,
      last_content: '',
      last_at: '',
      last_from_me: false,
      unread_count: 0,
      author: f.author,
    }));

  return (
    <div className="mx-auto max-w-wide space-y-3">
      {/* 「我的主页」入口不在这里 —— 已挪到广场顶栏右上角（头像），
          「声音与通知」并进「总设置」。这两件事都不该压在本板块标题下面。 */}

      {/* 一次性提示：删除失败的原因 / 删除成功的结果。
          以前删除是静默的 —— 删不掉也什么都不说，用户只能猜。 */}
      {notice && (
        <p
          role="status"
          className="rounded-card-lg border border-apple-border bg-apple-card px-3.5 py-2.5 text-xs leading-relaxed text-apple-text-2 shadow-card"
        >
          {notice}
        </p>
      )}

      {/* 待处理的好友申请 */}
      {friends.incoming.length > 0 && (
        <section className="rounded-card-lg border border-apple-blue/25 bg-apple-blue-soft p-4">
          <h2 className="text-sm font-semibold text-apple-text">
            好友申请 · {friends.incoming.length} 条
          </h2>
          <ul className="mt-3 space-y-2">
            {friends.incoming.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2.5">
                <Avatar
                  avatarKey={entry.author?.avatar_key}
                  avatarUrl={entry.author?.avatar_url}
                  name={entry.author?.display_name}
                  size={36}
                />
                <span className="min-w-0 flex-1 truncate text-base text-apple-text">
                  {entry.author?.display_name ?? '用户'}
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleRespond(entry, 'accept')}
                  disabled={busyId === entry.id}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  同意
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleRespond(entry, 'reject')}
                  disabled={busyId === entry.id}
                >
                  拒绝
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="space-y-2">
        {/* 「我的收藏」置顶：用户 2026-09-22 要求收藏的帖子出现在对话里。
            它不是 DM（没有对端），所以不走 ThreadRow，单独一条入口 */}
        <li>
          <button
            type="button"
            onClick={() => setOpenBookmarks(true)}
            className="flex w-full items-center gap-3 rounded-card-lg border border-apple-blue/30 bg-apple-card px-3.5 py-3 text-left pressable hover:bg-apple-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
          >
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-apple-blue-soft">
              <Bookmark className="h-5 w-5 fill-current text-apple-blue" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-md font-semibold text-apple-text">
                  我的收藏
                </span>
                <span className="flex-none rounded-chip bg-apple-blue-soft px-1.5 py-0.5 text-micro font-medium text-apple-blue">
                  只属于你
                </span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-apple-text-2">
                收藏的帖子与你的备注，都在这里
              </span>
            </span>
          </button>
        </li>

        <li>
          <ThreadRow
            thread={official}
            pinned
            onClick={() => setOpenThread(official)}
          />
        </li>

        {[...friendThreads, ...silentFriends].map((t) => {
          // 有消息 = 这行来自聊天记录；没消息 = 只是好友（行来自好友关系）。
          // 两者删除语义不同：有记录删记录，没记录可删才删好友（用户拍板）。
          const hasMessages = Boolean(t.last_at);
          return (
            <li key={t.peer_id}>
              <SwipeToDelete
                open={swipedId === t.peer_id}
                onOpenChange={(open) => setSwipedId(open ? t.peer_id : null)}
                confirmText={hasMessages ? '删除聊天记录' : '删除好友'}
                onDelete={() => {
                  setSwipedId(null);
                  if (hasMessages) setConfirmHide(t);
                  else void handleRemoveByPeer(t.peer_id);
                }}
              >
                <ThreadRow thread={t} onClick={() => setOpenThread(t)} />
              </SwipeToDelete>
            </li>
          );
        })}
      </ul>

      {friends.friends.length === 0 && (
        <div className="pt-2">
          <EmptyState
            icon={UserPlus}
            title="还没有好友"
            description="去「交流」板块看看大家的帖子，点作者就能加好友。"
            size="inline"
          />
        </div>
      )}

      {friends.outgoing.length > 0 && (
        <p className="pt-1 text-center text-2xs text-apple-text-3">
          已发出 {friends.outgoing.length} 条好友申请，等待对方通过
        </p>
      )}

      {/* 删除聊天记录前问一句：这一步不可撤销（水位线推过之后，那段历史
          对我永远看不到了），滑动+点击两下就永久删掉太轻率 */}
      <BottomSheet
        open={confirmHide !== null}
        onClose={() => (hiding ? undefined : setConfirmHide(null))}
        title="删除聊天记录"
      >
        <div className="pb-4">
          <p className="text-md text-apple-text">
            删除与「{confirmHide?.author?.display_name ?? '对方'}」的聊天记录？
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-apple-text-2">
            只对你生效：对方那边不受影响，他之后再发来消息，会话会重新出现在列表里。
            这段历史删掉之后你自己也看不到了。
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setConfirmHide(null)}
              disabled={hiding}
            >
              取消
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={() => confirmHide && void handleHide(confirmHide)}
              disabled={hiding}
            >
              {hiding ? '删除中…' : '删除'}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

/** 会话行：头像 + 名字 + 最后一条 + 未读角标 */
function ThreadRow({
  thread,
  pinned = false,
  onClick,
}: {
  thread: DmThread;
  pinned?: boolean;
  onClick: () => void;
}) {
  const hasUnread = thread.unread_count > 0;
  const subtitle = thread.last_content
    ? `${thread.last_from_me ? '我：' : ''}${thread.last_content}`
    : thread.is_official
      ? '给官方留言，小机器人会回复你'
      : '还没有消息，打个招呼吧';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-card-lg border bg-apple-card px-3.5 py-3 text-left',
        'pressable hover:bg-apple-bg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40',
        pinned ? 'border-apple-blue/30' : 'border-apple-border',
      )}
    >
      {thread.is_official ? (
        <span className="orbi-still h-11 w-11 flex-none">
          <Orbi size={44} interactive={false} />
        </span>
      ) : (
        <Avatar
          avatarKey={thread.author?.avatar_key}
          avatarUrl={thread.author?.avatar_url}
          name={thread.author?.display_name}
          size={44}
        />
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-md font-semibold text-apple-text">
            {thread.is_official ? 'Zorvin 官方' : (thread.author?.display_name ?? '好友')}
          </span>
          {pinned && (
            <span className="flex-none rounded-chip bg-apple-blue-soft px-1.5 py-0.5 text-micro font-medium text-apple-blue">
              官方
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-apple-text-2">
          {subtitle}
        </span>
      </span>

      <span className="flex flex-none flex-col items-end gap-1">
        {thread.last_at && (
          <span className="text-2xs text-apple-text-3">{timeAgo(thread.last_at)}</span>
        )}
        {hasUnread && (
          <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-apple-danger px-[5px] text-micro font-semibold leading-none text-white">
            {thread.unread_count > 99 ? '99+' : thread.unread_count}
          </span>
        )}
        {!hasUnread && !thread.last_at && (
          <MessageCircle className="h-4 w-4 text-apple-text-3" aria-hidden />
        )}
      </span>
    </button>
  );
}

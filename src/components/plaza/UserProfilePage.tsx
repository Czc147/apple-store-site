'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Heart,
  MessageCircle,
  ShoppingBasket,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import BottomSheet from '@/components/ui/BottomSheet';
import DataError from '@/components/ui/DataError';
import EmptyState from '@/components/ui/EmptyState';
import RegisterBanner from '@/components/ui/RegisterBanner';
import {
  fetchUserProfile,
  type ProfileGroupBuy,
  type ProfilePost,
  type UserProfileData,
} from '@/lib/user-profile';
import { requestFriend, removeFriend, respondFriend } from '@/lib/dm';
import { formatPrice, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * 个人主页（用户需求 #5 / #6）。
 *
 * - 点任何头像都能进来，看他的**作品**（帖子）与**进行中的拼单**
 * - **看不到他的收藏** —— 收藏是他自己的私人空间（在「对话 → 我的收藏」里），
 *   主页聚合展示等于替他把私密内容公开了。接口层也没返回，不是前端藏一下。
 * - 好友主页上可以直接**删好友**（用户 #6）；删完不用跳走，
 *   按钮当页变成「加好友」，避免用户以为没生效
 */
export default function UserProfilePage({ userId }: { userId: string }) {
  const { user, loading, getAuthHeaders } = useAuth();
  const [data, setData] = useState<UserProfileData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmUnfriend, setConfirmUnfriend] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchUserProfile(getAuthHeaders, userId);
    if (!res) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setData(res);
  }, [getAuthHeaders, userId]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setData(null);
      return;
    }
    void load();
  }, [loading, user?.id, load]);

  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 2600);
    return () => window.clearTimeout(t);
  }, [msg]);

  if (loading) {
    return <p className="py-16 text-center text-sm text-apple-text-3">加载中…</p>;
  }
  if (!user) {
    return (
      <div className="px-page py-6">
        <RegisterBanner />
      </div>
    );
  }
  if (failed && data === null) {
    return (
      <div className="px-page py-6">
        <DataError
          message="主页加载失败，请检查网络后重试"
          onRetry={() => void load()}
          size="inline"
        />
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="px-page py-6" aria-busy="true" aria-label="主页加载中">
        <div className="skeleton h-24 w-full rounded-card-lg" />
        <div className="skeleton mt-3 h-40 w-full rounded-card-lg" />
      </div>
    );
  }

  const { profile, relation } = data;

  const handleAdd = async () => {
    setBusy(true);
    const res = await requestFriend(getAuthHeaders, userId);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setMsg(res.becameFriends ? '你们已成为好友' : '好友申请已发出');
    await load();
  };

  const handleUnfriend = async () => {
    if (!data.friendship_id) return;
    setBusy(true);
    const ok = await removeFriend(getAuthHeaders, data.friendship_id);
    setBusy(false);
    setConfirmUnfriend(false);
    if (!ok) {
      setMsg('删除失败，请稍后再试');
      return;
    }
    setMsg('已删除好友');
    await load();
  };

  const handleRespond = async (action: 'accept' | 'reject') => {
    if (!data.friendship_id) return;
    setBusy(true);
    const ok = await respondFriend(getAuthHeaders, data.friendship_id, action);
    setBusy(false);
    if (!ok) {
      setMsg('操作失败，请稍后再试');
      return;
    }
    setMsg(action === 'accept' ? '已同意好友申请' : '已拒绝');
    await load();
  };

  return (
    <div className="pb-8">
      {/* 返回：主页是独立路由，但用户是从广场进来的，给个明确的回头路 */}
      <div className="px-page pt-3">
        <Link
          href="/community/plaza"
          className="-ml-2 inline-flex items-center gap-0.5 rounded-btn py-2 pl-1 pr-3 text-sm font-medium text-apple-text-2 transition-colors duration-fast ease-apple hover:text-apple-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          返回
        </Link>
      </div>

      {/* 名片 */}
      <header className="px-page pt-2">
        <div className="mx-auto max-w-wide">
          <div className="flex items-center gap-4">
            <Avatar
              avatarKey={profile.avatar_key ?? undefined}
              avatarUrl={profile.avatar_url}
              name={profile.display_name}
              size={72}
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-editorial-title font-semibold text-apple-text">
                {profile.display_name}
              </h1>
              <p className="mt-1 text-sm text-apple-text-2">
                {data.post_count} 条作品
                {data.group_buys.length > 0 && ` · ${data.group_buys.length} 个拼单进行中`}
              </p>
            </div>
          </div>

          {/* 关系按钮 */}
          <div className="mt-4 flex flex-wrap gap-2">
            {relation === 'me' && (
              <Button variant="secondary" size="sm" href="/library">
                这是我的主页 · 去编辑资料
              </Button>
            )}

            {relation === 'none' && (
              <Button variant="primary" size="sm" onClick={() => void handleAdd()} disabled={busy}>
                <UserPlus className="h-3.5 w-3.5" aria-hidden />
                加好友
              </Button>
            )}

            {relation === 'outgoing' && (
              <Badge tone="neutral">好友申请已发出，等对方通过</Badge>
            )}

            {relation === 'incoming' && (
              <>
                <Button variant="primary" size="sm" onClick={() => void handleRespond('accept')} disabled={busy}>
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  同意好友申请
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void handleRespond('reject')} disabled={busy}>
                  拒绝
                </Button>
              </>
            )}

            {relation === 'friend' && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  href={`/community/plaza`}
                  // 发消息要进「对话」板块找他 —— 没有独立的聊天路由
                >
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                  去对话里聊
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmUnfriend(true)}
                  disabled={busy}
                >
                  <UserMinus className="h-3.5 w-3.5" aria-hidden />
                  删除好友
                </Button>
              </>
            )}
          </div>

          {msg && (
            <p className="mt-3 rounded-card bg-apple-blue-soft px-3.5 py-2.5 text-sm text-apple-text" role="status">
              {msg}
            </p>
          )}
        </div>
      </header>

      {/* 作品 */}
      <section className="mt-7 px-page">
        <div className="mx-auto max-w-wide">
          <h2 className="mb-2.5 text-base font-semibold text-apple-text">
            作品
            {data.post_count > 0 && (
              <span className="ml-1.5 text-sm font-normal tabular-nums text-apple-text-3">
                {data.post_count}
              </span>
            )}
          </h2>

          {data.posts.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="还没有作品"
              description={relation === 'me' ? '去「交流」板块发第一条吧。' : '他还没有发过内容。'}
              size="inline"
            />
          ) : (
            <ul className="space-y-2.5">
              {data.posts.map((p) => (
                <PostItem key={p.id} post={p} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 进行中的拼单 */}
      {data.group_buys.length > 0 && (
        <section className="mt-7 px-page">
          <div className="mx-auto max-w-wide">
            <h2 className="mb-2.5 text-base font-semibold text-apple-text">进行中的拼单</h2>
            <ul className="space-y-2">
              {data.group_buys.map((g) => (
                <GroupItem key={g.id} group={g} />
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 前台没有现成的确认弹层（ConfirmDialog 是后台专用的那套样式），
          这里用 BottomSheet 拼一个，与站点其余弹层同一材质 */}
      <BottomSheet
        open={confirmUnfriend}
        onClose={() => setConfirmUnfriend(false)}
        title="删除好友"
      >
        <p className="text-md leading-relaxed text-apple-text-2">
          确定要删除「{profile.display_name}」吗？删除后你们将无法互发消息，
          之前的聊天记录也会一并不可见。
        </p>
        <div className="mt-5 flex gap-2 pb-2">
          <Button
            variant="secondary"
            fullWidth
            onClick={() => setConfirmUnfriend(false)}
            disabled={busy}
          >
            取消
          </Button>
          <Button
            variant="danger"
            fullWidth
            onClick={() => void handleUnfriend()}
            disabled={busy}
          >
            {busy ? '删除中…' : '删除'}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

/** 作品卡：点击去交流板块定位到原帖（与「查看原帖」同一套 hash 机制） */
function PostItem({ post }: { post: ProfilePost }) {
  return (
    <li>
      <a
        href={`/community/plaza#post-${post.id}`}
        className={cn(
          'block rounded-card-lg border border-apple-border bg-apple-card p-4 shadow-card',
          'pressable hover:bg-apple-bg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40',
        )}
      >
        {post.content && (
          <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-apple-text [overflow-wrap:anywhere]">
            {post.content.length > 160 ? `${post.content.slice(0, 160)}…` : post.content}
          </p>
        )}

        {post.images.length > 0 && (
          <div className="mt-2.5 flex gap-1.5">
            {post.images.slice(0, 3).map((url) => (
              // 缩略图；点进原帖看大图
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                loading="lazy"
                className="h-20 w-20 rounded-input object-cover"
              />
            ))}
          </div>
        )}

        <p className="mt-2 flex items-center gap-3 text-2xs text-apple-text-3">
          <span>{timeAgo(post.created_at)}</span>
          <span className="inline-flex items-center gap-0.5">
            <Heart className="h-3 w-3" aria-hidden />
            {post.like_count}
          </span>
        </p>
      </a>
    </li>
  );
}

/** 拼单卡：点击去「一起买」板块定位到这一条（与「查看原帖」同一套 hash 机制） */
function GroupItem({ group }: { group: ProfileGroupBuy }) {
  const remaining = Math.max(0, group.target_count - group.member_count);
  return (
    <li>
      {/* 用普通 <a> 而不是 next/link：已经在广场页时 Link 走 pushState
          只改地址栏、不触发 hashchange，定位逻辑就不会跑（与 PostItem 同理） */}
      <a
        href={`/community/plaza#group-${group.id}`}
        className="flex items-center gap-3 rounded-card-lg border border-apple-border bg-apple-card p-3.5 shadow-card pressable hover:bg-apple-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
      >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-apple-blue-soft">
        <ShoppingBasket className="h-5 w-5 text-apple-blue" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium text-apple-text">
          {group.product_name}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-apple-text-2">
          <span>每人 {formatPrice(group.per_price)}</span>
          <span className="text-apple-text-3">
            {group.member_count}/{group.target_count}
            {group.status === 'open' && remaining > 0 && ` · 还差 ${remaining} 人`}
          </span>
          {group.status === 'full' && (
            <span className="text-apple-success">已成团</span>
          )}
        </span>
      </span>
        {group.status === 'open' && (
          <span className="flex flex-none items-center gap-1 text-2xs text-apple-text-3">
            <Clock className="h-3 w-3" aria-hidden />
            {expiryText(group.expires_at)}
          </span>
        )}
        {/* 可点的提示：右箭头。整行是链接，但列表里不给个箭头用户不知道能点 */}
        <ChevronRight className="h-4 w-4 flex-none text-apple-text-3" aria-hidden />
      </a>
    </li>
  );
}

function expiryText(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return '已到期';
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `剩 ${Math.floor(h / 24)} 天`;
  if (h >= 1) return `剩 ${h} 小时`;
  return `剩 ${Math.max(1, Math.floor(ms / 60000))} 分钟`;
}

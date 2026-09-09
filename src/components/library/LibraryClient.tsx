'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Inbox,
  LibraryBig,
  LogOut,
  RefreshCw,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useLocalLibrary } from '@/lib/unlocks';
import {
  fetchLibrary,
  syncLibrary,
  type LibraryProduct,
  type LibraryResponse,
  type LibrarySubscription,
  type SyncResultItem,
} from '@/lib/library-client';
import { formatExpiry } from '@/lib/format';
import EmptyState from '@/components/ui/EmptyState';
import DataError from '@/components/ui/DataError';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import SectionHeader from '@/components/ui/SectionHeader';
import Surface from '@/components/ui/Surface';
import CoverImage from '@/components/ui/CoverImage';
import ExternalLinkAction from '@/components/ui/ExternalLinkAction';
import RedeemClient from '@/components/redeem/RedeemClient';
import NotificationBell from '@/components/library/NotificationBell';
import ContentsView from '@/components/library/ContentsView';
import ProfileHeader from '@/components/library/ProfileHeader';

/**
 * 我的库（第 6 Tab，Brief §13.6：Personal Content Management Surface）：
 * - 游客：展示本机兑换记录 + 醒目注册横幅（换设备会丢失，引导注册永久保存）
 * - 登录：GET /api/library 为权威（订阅仓库 + 内容列表）；
 *   本机有未同步记录时提示一键 POST /api/library/sync，逐条展示结果。
 *
 * Phase 7 收敛（grouped content 减少「一功能一卡片」）：
 * - 同步提示 / 同步结果并入「兑换卡密」分组（同属卡密语义域），页面浮卡从
 *   最多 5 张减到 3 张
 * - btnPrimary/btnGhost 手抄类串 → Button；SectionTitle → SectionHeader；
 *   X 关闭钮(~16px) → IconButton(44pt)；私有绿红 → success/danger token；
 *   订阅商品卡裸 img → CoverImage；外链行 ×2 → ExternalLinkAction；
 *   仓库空态裸文字 → EmptyState(panel)
 * 业务逻辑（取数/同步/登录态分支）逐行保留未动。
 */
export default function LibraryClient() {
  const { user, loading, configured, getAuthHeaders, signOut } = useAuth();
  const local = useLocalLibrary();

  const [data, setData] = useState<LibraryResponse | null>(null);
  const [fetching, setFetching] = useState(false);
  // audit 修复：取数失败曾静默变「我的库还是空的」，错误伪装成空态且无从重试
  const [loadFailed, setLoadFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResultItem[] | null>(null);
  const [syncPromptDismissed, setSyncPromptDismissed] = useState(false);

  const loadLibrary = useCallback(async () => {
    setFetching(true);
    const d = await fetchLibrary(getAuthHeaders);
    if (d) {
      setData(d);
      setLoadFailed(false);
    } else {
      setLoadFailed(true);
    }
    setFetching(false);
  }, [getAuthHeaders]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setData(null);
      return;
    }
    void loadLibrary();
  }, [loading, user?.id, loadLibrary]);

  const pendingLocal = !loading && Boolean(user) && local.hasAny && !local.synced;

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResults(null);
    const codes = local.pendingCodes();
    const results = await syncLibrary(getAuthHeaders, codes);
    setSyncResults(results);
    if (results) local.markSynced();
    await loadLibrary();
    setSyncing(false);
  };

  const handleSignOut = async () => {
    await signOut();
    setData(null);
    setSyncResults(null);
    setSyncPromptDismissed(false);
  };

  const handleRedeemed = useCallback(() => {
    // 已登录兑换：服务端已落库，重新拉取权威权益以刷新「我的库」
    if (user) void loadLibrary();
  }, [user, loadLibrary]);

  if (loading) {
    return (
      <div className="px-page" aria-busy="true" aria-live="polite" aria-label="我的库加载中">
        <div className="skeleton mb-5 h-16 rounded-card-lg" />
        <div className="skeleton mb-5 h-32 rounded-card-lg" />
        <div className="skeleton h-20 rounded-card" />
      </div>
    );
  }

  /* ---------------- 游客视图 ---------------- */
  if (!user) {
    return (
      <div className="px-page pb-4">
        {configured ? (
          <Link
            href="/login?from=/library"
            className="mb-5 flex items-start gap-3 rounded-card-lg border border-apple-blue/25 bg-apple-blue-soft/60 p-4 transition-colors duration-fast ease-apple hover:bg-apple-blue-soft active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
          >
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-apple-blue/10">
              <UserPlus className="h-5 w-5 text-apple-blue" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-md font-semibold text-apple-text">
                注册账号，永久保存你的权益
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-apple-text-2">
                当前为游客，兑换记录只存在本机，换设备会丢失。注册 / 登录后即可同步到「我的库」。
              </span>
            </span>
          </Link>
        ) : null}

        {/* 兑换卡密（内嵌顶部） */}
        <section className="mb-5">
          <SectionHeader title="兑换卡密" />
          <Surface radius="card-lg" className="p-4">
            <RedeemClient onRedeemed={handleRedeemed} />
          </Surface>
        </section>

        {local.hasAny ? (
          <>
            {local.dailyPlan && (
              <GuestDailyCard expiresAt={local.dailyPlan.expires_at} />
            )}
            {local.contents.length > 0 && (
              <section className={local.dailyPlan ? 'mt-6' : ''}>
                <SectionHeader title="我的内容" count={local.contents.length} />
                <ContentsView
                  contents={local.contents.map((c) => ({
                    id: c.code,
                    name: c.name,
                    description: c.description,
                    media_url: c.media_url,
                  }))}
                />
              </section>
            )}
          </>
        ) : (
          <EmptyState
            icon={LibraryBig}
            title="我的库还是空的"
            description="在上方「兑换卡密」输入卡密解锁订阅或兑换内容后，这里会显示你的全部权益。"
          />
        )}
      </div>
    );
  }

  /* ---------------- 登录视图 ---------------- */
  const email = data?.user.email ?? user.email ?? '';
  const contents = data?.contents ?? [];
  const subscriptions = data?.subscriptions ?? [];
  const hasServerData = contents.length > 0 || subscriptions.length > 0;

  return (
    <div className="px-page pb-4">
      {/* 账号分组：头像/昵称（点击编辑资料）+ 通知铃 + 退出 */}
      <Surface radius="card-lg" className="mb-5 flex items-center justify-between gap-3 px-4 py-2.5">
        <ProfileHeader getAuthHeaders={getAuthHeaders} fallbackEmail={email} />
        <div className="flex shrink-0 items-center">
          <NotificationBell />
          <Button
            variant="secondary"
            size="sm"
            className="ml-1"
            onClick={() => void handleSignOut()}
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            退出
          </Button>
        </div>
      </Surface>

      {/* 兑换卡密分组（同步提示/同步结果并入本组——同属卡密语义域） */}
      <section className="mb-5">
        <SectionHeader title="兑换卡密" />
        <Surface radius="card-lg" className="p-4">
          <RedeemClient onRedeemed={handleRedeemed} />

          {/* 本机未同步记录提示 */}
          {pendingLocal && !syncPromptDismissed && (
            <div className="mt-4 border-t border-apple-hairline pt-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-apple-blue-soft">
                  <RefreshCw className="h-[18px] w-[18px] text-apple-blue" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-apple-text">
                    检测到本机 {local.pendingCodes().length} 条兑换记录
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-apple-text-2">
                    同步后这些权益会永久绑定到当前账号，换设备也能找回。
                  </p>
                </div>
                <IconButton
                  icon={X}
                  label="忽略提示"
                  onClick={() => setSyncPromptDismissed(true)}
                  className="-mr-2.5 -mt-1"
                />
              </div>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                className="mt-3"
                loading={syncing}
                onClick={() => void handleSync()}
              >
                {syncing ? '同步中…' : '一键同步到账号'}
              </Button>
            </div>
          )}

          {/* 同步结果逐条展示 */}
          {syncResults && (
            <div className="mt-4 border-t border-apple-hairline pt-4">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-base font-semibold text-apple-text">同步结果</p>
                <IconButton
                  icon={X}
                  label="关闭结果"
                  onClick={() => setSyncResults(null)}
                  className="-mr-2.5"
                />
              </div>
              <ul className="space-y-1.5">
                {syncResults.map((r, i) => (
                  <li key={`${r.code}-${i}`} className="flex items-start gap-2 text-sm">
                    {r.ok ? (
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-apple-success"
                        aria-hidden
                      />
                    ) : (
                      <AlertCircle
                        className="mt-0.5 h-4 w-4 shrink-0 text-apple-danger"
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-apple-text-3">{r.code}</span>
                      <span className="ml-2 text-apple-text-2">{r.message}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Surface>
      </section>

      {fetching && !data ? (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <div className="skeleton h-28 rounded-card-lg" />
          <div className="skeleton h-20 rounded-card" />
        </div>
      ) : loadFailed && !data ? (
        <DataError
          message="加载我的库失败，请检查网络后重试"
          onRetry={() => void loadLibrary()}
          size="inline"
        />
      ) : (
        <>
          {/* 订阅仓库 */}
          {subscriptions.length > 0 && (
            <section>
              <SectionHeader title="我的订阅" count={subscriptions.length} />
              <div className="space-y-4">
                {subscriptions.map((sub) => (
                  <SubscriptionRepoSection key={sub.entitlement.id} data={sub} />
                ))}
              </div>
            </section>
          )}

          {/* 我的内容 */}
          {contents.length > 0 && (
            <section className={subscriptions.length > 0 ? 'mt-6' : ''}>
              <SectionHeader title="我的内容" count={contents.length} />
              <ContentsView contents={contents} />
            </section>
          )}

          {!hasServerData && (
            <EmptyState
              icon={LibraryBig}
              title="我的库还是空的"
              description="在上方「兑换卡密」输入卡密解锁订阅或兑换内容后，这里会显示你的全部权益。"
            />
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- 子组件 ---------------- */

/** 游客态每日计划卡（本机记录，权威状态以服务端为准） */
function GuestDailyCard({ expiresAt }: { expiresAt: string | null }) {
  return (
    <Surface radius="card-lg" className="overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-apple-blue-soft">
          <Sparkles className="h-5 w-5 text-apple-blue" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-md font-bold text-apple-text">每日计划</p>
          <p className="mt-0.5 text-xs text-apple-text-2">
            {expiresAt ? `有效期至 ${formatExpiry(expiresAt)}（本机记录）` : '永久有效（本机记录）'}
          </p>
        </div>
      </div>
      <div className="border-t border-apple-hairline p-4">
        {/* 死循环链接已修：/daily 重定向回 /library，今日推荐在首页 Hero 区 */}
        <Button variant="primary" size="lg" fullWidth href="/">
          查看今日推荐
        </Button>
        <p className="mt-2 text-center text-2xs text-apple-text-3">
          注册账号后可永久保存，换设备也能找回
        </p>
      </div>
    </Surface>
  );
}

/** 订阅仓库分组：订阅名 + 状态 + 其下商品卡片 */
function SubscriptionRepoSection({ data }: { data: LibrarySubscription }) {
  const permanent = !data.entitlement.expires_at;
  const expired = !permanent && Date.parse(data.entitlement.expires_at as string) < Date.now();

  return (
    <Surface radius="card-lg" className="overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-apple-blue-soft">
          <Sparkles className="h-5 w-5 text-apple-blue" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-md font-bold text-apple-text">
            {data.name ?? '订阅'}
          </p>
          <p className="mt-0.5 text-xs text-apple-text-2">
            {permanent
              ? '永久有效'
              : expired
                ? '已过期'
                : `有效期至 ${formatExpiry(data.entitlement.expires_at)}`}
          </p>
        </div>
      </div>
      <div className="border-t border-apple-hairline p-4">
        {data.products.length === 0 ? (
          <EmptyState
            icon={Inbox}
            size="panel"
            title={expired ? '订阅已过期' : '暂无内容'}
            description={expired ? '续费后可查看内容' : '当前还没有内容，敬请期待'}
            className="pb-6 pt-4"
          />
        ) : (
          <div className="space-y-3">
            {data.products.map((p) => (
              <SubscriptionProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </Surface>
  );
}

/** 订阅商品卡：封面 teaser（CoverImage 骨架+回退）+ 标题 + 介绍 + 「打开内容 / 打开链接」 */
function SubscriptionProductCard({ product }: { product: LibraryProduct }) {
  return (
    <Surface radius="card" className="overflow-hidden">
      {product.cover_url && (
        <CoverImage
          src={product.cover_url}
          alt={`${product.title} 封面`}
          ratio="video"
          sizes="(min-width: 640px) 440px, 92vw"
        />
      )}
      <div className="p-4">
        <p className="text-base font-medium text-apple-text">{product.title}</p>
        {product.description && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-apple-text-2">
            {product.description}
          </p>
        )}
        {(product.media_url || product.link_url) && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {product.media_url && (
              <ExternalLinkAction href={product.media_url}>打开内容</ExternalLinkAction>
            )}
            {product.link_url && (
              <ExternalLinkAction href={product.link_url}>打开链接</ExternalLinkAction>
            )}
          </div>
        )}
      </div>
    </Surface>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
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
import EmptyState from '@/components/ui/EmptyState';
import RedeemClient from '@/components/redeem/RedeemClient';
import NotificationBell from '@/components/library/NotificationBell';
import ContentsView from '@/components/library/ContentsView';

/** 到期时间 → YYYY-MM-DD（仅日期；非法值返回空串） */
function formatExpiry(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const btnPrimary =
  'inline-flex h-10 items-center justify-center rounded-btn bg-apple-blue px-5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.3)] transition-[background-color,transform] duration-200 ease-apple hover:bg-apple-blue-hover active:scale-[0.99] active:bg-apple-blue-active';
const btnGhost =
  'inline-flex h-10 items-center justify-center rounded-btn border border-apple-border bg-white px-4 text-[14px] font-medium text-apple-text transition hover:bg-apple-bg active:scale-95';

/**
 * 我的库（第 6 Tab）：
 * - 游客：展示本机兑换记录 + 醒目注册横幅（换设备会丢失，引导注册永久保存）
 * - 登录：GET /api/library 为权威（每日计划卡 + 内容列表）；
 *   本机有未同步记录时提示一键 POST /api/library/sync，逐条展示结果；
 *   顶部显示邮箱 + 退出。
 */
export default function LibraryClient() {
  const { user, loading, configured, getAuthHeaders, signOut } = useAuth();
  const local = useLocalLibrary();

  const [data, setData] = useState<LibraryResponse | null>(null);
  const [fetching, setFetching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResultItem[] | null>(null);
  const [syncPromptDismissed, setSyncPromptDismissed] = useState(false);

  const loadLibrary = useCallback(async () => {
    setFetching(true);
    const d = await fetchLibrary(getAuthHeaders);
    setData(d);
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
      <div className="px-4 sm:px-5">
        <div className="skeleton mb-4 h-28 rounded-card-lg" />
        <div className="skeleton h-20 rounded-card" />
      </div>
    );
  }

  /* ---------------- 游客视图 ---------------- */
  if (!user) {
    return (
      <div className="px-4 pb-4 sm:px-5">
        {configured ? (
          <Link
            href="/login?from=/library"
            className="mb-5 flex items-start gap-3 rounded-card-lg border border-apple-blue/25 bg-apple-blue-soft/60 p-4 transition hover:bg-apple-blue-soft"
          >
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-apple-blue/10">
              <UserPlus className="h-5 w-5 text-apple-blue" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-apple-text">
                注册账号，永久保存你的权益
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-apple-text-2">
                当前为游客，兑换记录只存在本机，换设备会丢失。注册 / 登录后即可同步到「我的库」。
              </span>
            </span>
          </Link>
        ) : null}

        {/* 兑换卡密（内嵌顶部） */}
        <section>
          <h2 className="mb-3 text-[17px] font-bold text-apple-text">兑换卡密</h2>
          <div className="rounded-card-lg border border-apple-border bg-apple-card p-4 shadow-card">
            <RedeemClient onRedeemed={handleRedeemed} />
          </div>
        </section>

        {local.hasAny ? (
          <>
            {local.dailyPlan && (
              <GuestDailyCard expiresAt={local.dailyPlan.expires_at} />
            )}
            {local.contents.length > 0 && (
              <section className={local.dailyPlan ? 'mt-6' : ''}>
                <SectionTitle title="我的内容" count={local.contents.length} />
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
  const dailyPlan = data?.daily_plan ?? null;
  const dailyStatus = data?.daily_status ?? null;
  const contents = data?.contents ?? [];
  const subscriptions = data?.subscriptions ?? [];
  const hasServerData =
    Boolean(dailyPlan) || contents.length > 0 || subscriptions.length > 0;

  return (
    <div className="px-4 pb-4 sm:px-5">
      {/* 账号条：邮箱 + 退出 */}
      <div className="mb-5 flex items-center justify-between gap-3 rounded-card-lg border border-apple-border bg-apple-card px-4 py-3 shadow-card">
        <div className="min-w-0">
          <p className="text-[11px] text-apple-text-3">已登录</p>
          <p className="truncate text-[14px] font-medium text-apple-text">{email}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <NotificationBell />
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="inline-flex items-center gap-1.5 rounded-btn border border-apple-border bg-white px-3 py-1.5 text-[13px] font-medium text-apple-text-2 transition hover:bg-apple-bg hover:text-apple-text"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            退出
          </button>
        </div>
      </div>

      {/* 兑换卡密（内嵌顶部） */}
      <section className="mb-5">
        <h2 className="mb-3 text-[17px] font-bold text-apple-text">兑换卡密</h2>
        <div className="rounded-card-lg border border-apple-border bg-apple-card p-4 shadow-card">
          <RedeemClient onRedeemed={handleRedeemed} />
        </div>
      </section>

      {/* 本机未同步记录提示 */}
      {pendingLocal && !syncPromptDismissed && (
        <div className="mb-5 rounded-card-lg border border-apple-border bg-apple-card p-4 shadow-card">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-apple-blue/10">
              <RefreshCw className="h-4 w-4 text-apple-blue" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-apple-text">
                检测到本机 {local.pendingCodes().length} 条兑换记录
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-apple-text-2">
                同步后这些权益会永久绑定到当前账号，换设备也能找回。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSyncPromptDismissed(true)}
              className="shrink-0 text-apple-text-3 transition hover:text-apple-text"
              aria-label="忽略提示"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing}
            className={`${btnPrimary} mt-3 w-full disabled:cursor-not-allowed disabled:bg-apple-border disabled:text-apple-text-3`}
          >
            {syncing ? '同步中…' : '一键同步到账号'}
          </button>
        </div>
      )}

      {/* 同步结果逐条展示 */}
      {syncResults && (
        <div className="mb-5 rounded-card-lg border border-apple-border bg-apple-card p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[14px] font-semibold text-apple-text">同步结果</p>
            <button
              type="button"
              onClick={() => setSyncResults(null)}
              className="text-apple-text-3 transition hover:text-apple-text"
              aria-label="关闭结果"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <ul className="space-y-1.5">
            {syncResults.map((r, i) => (
              <li key={`${r.code}-${i}`} className="flex items-start gap-2 text-[13px]">
                {r.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1B7F3B]" aria-hidden />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#D70015]" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="font-mono text-[12px] text-apple-text-3">{r.code}</span>
                  <span className="ml-2 text-apple-text-2">{r.message}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {fetching && !data ? (
        <div className="space-y-4">
          <div className="skeleton h-28 rounded-card-lg" />
          <div className="skeleton h-20 rounded-card" />
        </div>
      ) : (
        <>
          {/* 每日计划卡 */}
          <DailyPlanCard dailyStatus={dailyStatus} />

          {/* 订阅仓库 */}
          {subscriptions.length > 0 && (
            <section className="mt-6">
              <SectionTitle title="我的订阅" count={subscriptions.length} />
              <div className="space-y-4">
                {subscriptions.map((sub) => (
                  <SubscriptionRepoSection key={sub.entitlement.id} data={sub} />
                ))}
              </div>
            </section>
          )}

          {/* 我的内容 */}
          {contents.length > 0 && (
            <section className="mt-6">
              <SectionTitle title="我的内容" count={contents.length} />
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

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-[17px] font-bold text-apple-text">{title}</h2>
      <span className="text-[12.5px] text-apple-text-3">共 {count} 项</span>
    </div>
  );
}

/** 游客态每日计划卡（本机记录，权威状态以服务端为准） */
function GuestDailyCard({ expiresAt }: { expiresAt: string | null }) {
  return (
    <div className="overflow-hidden rounded-card-lg border border-apple-border bg-apple-card shadow-card">
      <div className="flex items-center gap-3 p-4">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-apple-blue-soft">
          <Sparkles className="h-5 w-5 text-apple-blue" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-apple-text">每日计划</p>
          <p className="mt-0.5 text-[12.5px] text-apple-text-2">
            {expiresAt ? `有效期至 ${formatExpiry(expiresAt)}（本机记录）` : '永久有效（本机记录）'}
          </p>
        </div>
      </div>
      <div className="border-t border-apple-hairline p-4">
        <Link href="/daily" className={`${btnPrimary} w-full`}>
          查看今日推荐
        </Link>
        <p className="mt-2 text-center text-[11.5px] text-apple-text-3">
          注册账号后可永久保存，换设备也能找回
        </p>
      </div>
    </div>
  );
}

/** 登录态每日计划卡：按服务端实时状态渲染（未解锁 / 已解锁 / 已过期） */
function DailyPlanCard({
  dailyStatus,
}: {
  dailyStatus: LibraryResponse['daily_status'] | null;
}) {
  const unlocked = Boolean(dailyStatus?.unlocked);
  const expired = Boolean(dailyStatus?.expired);

  return (
    <div className="overflow-hidden rounded-card-lg border border-apple-border bg-apple-card shadow-card">
      <div className="flex items-center gap-3 p-4">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-apple-blue-soft">
          <Sparkles className="h-5 w-5 text-apple-blue" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-apple-text">每日计划</p>
          {unlocked ? (
            <p className="mt-0.5 text-[12.5px] text-apple-text-2">
              {dailyStatus?.permanent
                ? '永久有效 · 每天更新 1 期精选内容'
                : `有效期至 ${formatExpiry(dailyStatus?.expires_at)}${
                    dailyStatus?.remaining_days != null
                      ? `（剩余 ${dailyStatus.remaining_days} 天）`
                      : ''
                  }`}
            </p>
          ) : expired ? (
            <p className="mt-0.5 text-[12.5px] text-[#D70015]">已过期，续费后可继续查看</p>
          ) : (
            <p className="mt-0.5 text-[12.5px] text-apple-text-3">尚未解锁</p>
          )}
        </div>
      </div>
      <div className="border-t border-apple-hairline p-4">
        {unlocked ? (
          <Link href="/daily" className={`${btnPrimary} w-full`}>
            查看今日推荐
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <Link href="/subscription" className={`${btnPrimary} flex-1`}>
              {expired ? '立即续费' : '订阅每日计划'}
            </Link>
            <Link
              href="/redeem"
              className="whitespace-nowrap text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
            >
              已有兑换码？
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/** 订阅仓库分组：订阅名 + 状态 + 其下商品卡片 */
function SubscriptionRepoSection({ data }: { data: LibrarySubscription }) {
  const permanent = !data.entitlement.expires_at;
  const expired = !permanent && Date.parse(data.entitlement.expires_at as string) < Date.now();

  return (
    <div className="overflow-hidden rounded-card-lg border border-apple-border bg-apple-card shadow-card">
      <div className="flex items-center gap-3 p-4">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-apple-blue-soft">
          <Sparkles className="h-5 w-5 text-apple-blue" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-apple-text">
            {data.name ?? '订阅'}
          </p>
          <p className="mt-0.5 text-[12.5px] text-apple-text-2">
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
          <p className="text-center text-[13px] text-apple-text-3">
            {expired ? '订阅已过期，续费后可查看内容' : '当前还没有内容，敬请期待'}
          </p>
        ) : (
          <div className="space-y-3">
            {data.products.map((p) => (
              <SubscriptionProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 订阅商品卡：封面 teaser + 标题 + 介绍 + 「打开内容 / 打开链接」 */
function SubscriptionProductCard({ product }: { product: LibraryProduct }) {
  return (
    <div className="overflow-hidden rounded-card border border-apple-border bg-apple-card shadow-card">
      {product.cover_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.cover_url}
          alt={`${product.title} 封面`}
          loading="lazy"
          className="aspect-[16/9] w-full bg-apple-bg object-cover"
        />
      )}
      <div className="p-4">
        <p className="text-[14.5px] font-medium text-apple-text">{product.title}</p>
        {product.description && (
          <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-apple-text-2">
            {product.description}
          </p>
        )}
        {(product.media_url || product.link_url) && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {product.media_url && (
              <a
                href={product.media_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
              >
                打开内容
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
            {product.link_url && (
              <a
                href={product.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
              >
                打开链接
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

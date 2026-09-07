'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Gift,
  LibraryBig,
  Lock,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useLocalLibrary } from '@/lib/unlocks';
import { fetchDailyAccess, type DailyAccessStatus } from '@/lib/daily-client';
import { formatPickDate, todayDateCN } from '@/lib/daily';
import type { DailyPickTeaser } from '@/lib/types';
import EmptyState from '@/components/ui/EmptyState';
import ActionSheet, { SheetItem } from '@/components/ui/ActionSheet';
import PickContentViewer from './PickContentViewer';

interface DailyClientProps {
  /** 按日期倒序的全部日期 teaser（首条为最新一期） */
  teasers: DailyPickTeaser[];
  isDemo: boolean;
}

/**
 * 每日推荐页主体：
 * - 最新一期大卡：未解锁显示「订阅每日计划开启」引导；已解锁内联展示正文
 * - 历史仓库：往期列表（解锁前只能看到标题；点击弹订阅引导）；
 *   解锁后点击展开该期正文（手风琴，签名链接按需获取）
 */
export default function DailyClient({ teasers, isDemo }: DailyClientProps) {
  const { user, getAuthHeaders } = useAuth();
  const { dailyPlan } = useLocalLibrary();

  const [status, setStatus] = useState<DailyAccessStatus | 'checking'>('checking');
  const [openedDate, setOpenedDate] = useState<string | null>(null);
  const [lockedSheet, setLockedSheet] = useState(false);
  const [libraryPromptOpen, setLibraryPromptOpen] = useState(false);

  const code = dailyPlan?.code ?? null;
  const authKey = user?.id ?? (code ? `code:${code.slice(0, 8)}` : 'none');

  useEffect(() => {
    let alive = true;
    setStatus('checking');
    void fetchDailyAccess(getAuthHeaders, code).then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, [getAuthHeaders, code, user?.id]);

  if (teasers.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="暂无每日推荐"
        description="内容正在筹备中，订阅每日计划后每天都能收到新内容，敬请期待。"
      />
    );
  }

  const latest = teasers[0];
  const history = teasers.slice(1);
  const latestIsToday = latest.pick_date === todayDateCN();
  const unlocked = status !== 'checking' && status.unlocked;
  // 登录账号解锁：内容改在「我的库→我的订阅」查看；游客凭码解锁仍在本页内联查看
  const viewInLibrary = Boolean(user) && unlocked;

  const handleLockedTap = () => setLockedSheet(true);

  return (
    <div className="pb-4">
      {/* ---------- 最新一期 ---------- */}
      <section className="px-4 sm:px-5" aria-label="今日更新">
        <div className="overflow-hidden rounded-card-lg border border-apple-border bg-apple-card shadow-card">
          <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-apple-blue-soft via-white to-apple-surface">
            {latest.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={latest.cover_url}
                alt={`${latest.title} 封面`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Sparkles className="h-10 w-10 text-apple-blue/40" aria-hidden />
              </div>
            )}
            <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              {latestIsToday ? '今日更新' : `${formatPickDate(latest.pick_date)}更新`}
            </span>
          </div>

          <div className="p-4 sm:p-5">
            <h2 className="text-[17px] font-bold leading-snug text-apple-text">
              {latest.title}
            </h2>

            {status === 'checking' ? (
              <div className="mt-3 space-y-2">
                <div className="skeleton h-3.5 w-3/4 rounded-md" />
                <div className="skeleton h-40 w-full rounded-card" />
              </div>
            ) : unlocked && viewInLibrary ? (
              <div className="mt-3">
                <p className="flex items-center gap-1.5 text-[13px] leading-relaxed text-apple-text-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#1B7F3B]" aria-hidden />
                  内容已解锁，请前往「我的库」查看
                </p>
                <Link
                  href="/library"
                  className="mt-3.5 inline-flex h-10 items-center justify-center rounded-btn bg-apple-blue px-5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.3)] transition-[background-color,transform] duration-200 ease-apple hover:bg-apple-blue-hover active:scale-[0.99] active:bg-apple-blue-active"
                >
                  前往我的库
                </Link>
              </div>
            ) : unlocked ? (
              <div className="mt-3">
                <PickContentViewer
                  pickDate={latest.pick_date}
                  authKey={authKey}
                  getAuthHeaders={getAuthHeaders}
                  code={code}
                />
              </div>
            ) : (
              <div className="mt-3">
                <p className="flex items-center gap-1.5 text-[13px] leading-relaxed text-apple-text-2">
                  <Lock className="h-3.5 w-3.5 shrink-0 text-apple-text-3" aria-hidden />
                  {status.expired
                    ? '本期内容需续费每日计划后查看'
                    : '订阅每日计划后即可查看本期内容与全部历史仓库'}
                </p>
                <div className="mt-3.5 flex items-center gap-4">
                  <Link
                    href="/subscription"
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-btn bg-apple-blue px-5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.3)] transition-[background-color,transform] duration-200 ease-apple hover:bg-apple-blue-hover active:scale-[0.99] active:bg-apple-blue-active sm:flex-none"
                  >
                    {status.expired ? '立即续费' : '订阅每日计划开启'}
                  </Link>
                  <Link
                    href="/redeem"
                    className="whitespace-nowrap text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
                  >
                    已有兑换码？
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------- 历史仓库 ---------- */}
      {history.length > 0 && (
        <section className="mt-8 px-4 sm:px-5" aria-label="历史仓库">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[17px] font-bold text-apple-text">历史仓库</h2>
            <span className="text-[12.5px] text-apple-text-3">
              共 {history.length} 期
            </span>
          </div>

          <div className="space-y-3">
            {history.map((pick) => {
              const isOpen = openedDate === pick.pick_date;
              return (
                <div
                  key={pick.pick_date}
                  className="overflow-hidden rounded-card border border-apple-border bg-apple-card shadow-card"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => {
                      if (!unlocked) {
                        handleLockedTap();
                        return;
                      }
                      if (viewInLibrary) {
                        setLibraryPromptOpen(true);
                        return;
                      }
                      setOpenedDate(isOpen ? null : pick.pick_date);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-apple-bg"
                  >
                    <span className="w-[52px] shrink-0 rounded-full bg-apple-blue-soft px-2 py-1 text-center text-[11px] font-medium text-apple-blue">
                      {formatPickDate(pick.pick_date)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-apple-text">
                        {pick.title}
                      </span>
                      {!unlocked && (
                        <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-apple-text-3">
                          <Lock className="h-3 w-3" aria-hidden />
                          解锁后可看
                        </span>
                      )}
                    </span>
                    {unlocked ? (
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-apple-text-3 transition-transform duration-200 ease-apple ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                        aria-hidden
                      />
                    ) : (
                      <Lock className="h-4 w-4 shrink-0 text-apple-text-3" aria-hidden />
                    )}
                  </button>

                  {unlocked && !viewInLibrary && isOpen && (
                    <div className="border-t border-apple-hairline px-4 py-4">
                      <PickContentViewer
                        pickDate={pick.pick_date}
                        authKey={authKey}
                        getAuthHeaders={getAuthHeaders}
                        code={code}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ---------- 未解锁点击历史时的引导弹层 ---------- */}
      <ActionSheet
        open={lockedSheet}
        onClose={() => setLockedSheet(false)}
        title="订阅每日计划解锁全部内容"
      >
        <p className="px-6 pb-2 pt-3 text-[13px] leading-relaxed text-apple-text-2">
          解锁后每天更新 1 期精选内容，并可查看全部历史仓库。
        </p>
        <div className="border-t border-apple-hairline">
          <SheetItem
            icon={CreditCard}
            title="订阅每日计划开启"
            subtitle="前往订阅页购买"
            href="/subscription"
          />
          <SheetItem
            icon={Gift}
            title="已有兑换码"
            subtitle="前往兑换页输入兑换码"
            href="/redeem"
          />
        </div>
        {status !== 'checking' && status.expired && (
          <p className="flex items-center justify-center gap-1 border-t border-apple-hairline px-6 py-3 text-[12px] text-apple-text-3">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            你的每日计划已过期，续费后即可继续查看
          </p>
        )}
        {isDemo && (
          <p className="px-6 pb-4 text-center text-[11.5px] text-apple-text-3">
            当前为演示数据
          </p>
        )}
      </ActionSheet>

      {/* ---------- 已解锁（登录账号）点击历史时的跳转提示 ---------- */}
      <ActionSheet
        open={libraryPromptOpen}
        onClose={() => setLibraryPromptOpen(false)}
        title="内容已在我的库"
      >
        <p className="px-6 pb-2 pt-3 text-[13px] leading-relaxed text-apple-text-2">
          每日计划内容现已统一在「我的库 → 我的订阅」中查看，和其他订阅一致。
        </p>
        <div className="border-t border-apple-hairline">
          <SheetItem
            icon={LibraryBig}
            title="前往我的库"
            subtitle="查看已解锁的全部内容"
            href="/library"
          />
        </div>
      </ActionSheet>
    </div>
  );
}

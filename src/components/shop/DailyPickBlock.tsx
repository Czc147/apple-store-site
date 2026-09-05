'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Lock, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useLocalLibrary } from '@/lib/unlocks';
import { fetchDailyAccess, type DailyAccessStatus } from '@/lib/daily-client';
import { formatPickDate } from '@/lib/daily';
import type { DailyPickTeaser } from '@/lib/types';

interface DailyPickBlockProps {
  teaser: DailyPickTeaser;
  /** 该条内容是否为北京时区的今天（决定徽章文案） */
  isToday: boolean;
  isDemo: boolean;
}

/**
 * 选购页「每日推荐」展示区块（服务端只给 teaser，解锁态客户端判定）：
 * - 未解锁/过期：封面 + 标题 + 「订阅每日计划开启」引导（跳订阅页）
 * - 已解锁：「查看今日更新」入口（跳 /daily 每日推荐页）
 * 解锁状态每次挂载实时向 /api/daily-access 校验（有效期服务端现算）。
 */
export default function DailyPickBlock({
  teaser,
  isToday,
  isDemo,
}: DailyPickBlockProps) {
  const { user, getAuthHeaders } = useAuth();
  const { dailyPlan } = useLocalLibrary();
  const [status, setStatus] = useState<DailyAccessStatus | 'checking'>('checking');

  // 登录用户走账号权益；游客用本地已核销码。两者变化（登录/兑换/跨标签）时重新校验
  const code = dailyPlan?.code ?? null;
  const userKey = user?.id ?? null;

  useEffect(() => {
    let alive = true;
    setStatus('checking');
    void fetchDailyAccess(getAuthHeaders, code).then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, [getAuthHeaders, code, userKey]);

  const unlocked = status !== 'checking' && status.unlocked;

  return (
    <section className="px-4 sm:px-5" aria-label="每日推荐">
      <div className="overflow-hidden rounded-card-lg border border-apple-border bg-apple-card shadow-card">
        {/* 封面（或渐变占位）+ 状态角标 */}
        <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-apple-blue-soft via-white to-apple-surface sm:aspect-[21/9]">
          {teaser.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={teaser.cover_url}
              alt={`${teaser.title} 封面`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Sparkles className="h-10 w-10 text-apple-blue/40" aria-hidden />
            </div>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
            {isToday ? '今日更新' : `${formatPickDate(teaser.pick_date)}更新`}
          </span>
          {status !== 'checking' && (
            <span
              className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm ${
                unlocked
                  ? 'bg-[#1B7F3B]/85 text-white'
                  : 'bg-black/45 text-white'
              }`}
            >
              {unlocked ? (
                <>
                  <CheckCircle2 className="h-3 w-3" aria-hidden />
                  已解锁
                </>
              ) : (
                <>
                  <Lock className="h-3 w-3" aria-hidden />
                  未解锁
                </>
              )}
            </span>
          )}
        </div>

        {/* 内容区 */}
        <div className="p-4 sm:p-5">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-apple-blue">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            每日推荐
            {isDemo && (
              <span className="rounded-full bg-apple-blue-soft px-2 py-0.5 text-[10px] text-apple-blue">
                演示数据
              </span>
            )}
          </p>
          <h2 className="mt-1.5 line-clamp-2 text-[17px] font-bold leading-snug text-apple-text">
            {teaser.title}
          </h2>

          {status === 'checking' ? (
            <div className="mt-3.5 space-y-2">
              <div className="skeleton h-3.5 w-2/3 rounded-md" />
              <div className="skeleton h-10 w-full rounded-btn" />
            </div>
          ) : unlocked ? (
            <Link
              href="/daily"
              className="mt-3.5 inline-flex h-10 w-full items-center justify-center gap-1 rounded-btn bg-apple-blue text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.3)] transition-[background-color,transform] duration-200 ease-apple hover:bg-apple-blue-hover active:scale-[0.99] active:bg-apple-blue-active"
            >
              查看今日更新
              <span aria-hidden>›</span>
            </Link>
          ) : (
            <>
              <p className="mt-2 flex items-center gap-1.5 text-[13px] leading-relaxed text-apple-text-2">
                <Lock className="h-3.5 w-3.5 shrink-0 text-apple-text-3" aria-hidden />
                {status.expired
                  ? '每日计划已过期，续费后继续查看每日更新与历史仓库'
                  : '订阅每日计划开启 · 每天更新 1 期精选内容，解锁后可看全部历史'}
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
            </>
          )}
        </div>
      </div>
    </section>
  );
}

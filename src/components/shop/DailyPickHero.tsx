'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Lock, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useLocalLibrary } from '@/lib/unlocks';
import { fetchDailyAccess, type DailyAccessStatus } from '@/lib/daily-client';
import { formatPickDate } from '@/lib/daily';
import type { DailyPickTeaser } from '@/lib/types';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import CoverImage from '@/components/ui/CoverImage';

interface DailyPickHeroProps {
  teaser: DailyPickTeaser;
  /** 该条内容是否为北京时区的今天（决定徽章文案） */
  isToday: boolean;
  isDemo: boolean;
}

/**
 * 首页 Hero：每日计划最新一期（UI 升级 §8.1 · Gallery White 编辑式 Hero）。
 * - 纯白画廊：去掉卡片描边与投影，让封面和标题承担视觉重心
 * - 移动端上下布局（图 → kicker → 大标题 → 说明 → 蓝色胶囊 CTA）
 * - 桌面左右分栏（左文右图，标题升到编辑级字号），容器放宽到 max-w-wide
 * - 封面走 CoverImage 16:9，带 shimmer 骨架与失败回退；无图时 accent_color 兜底
 * - 死链修复保持：已解锁「查看今日更新」→ /library；「已有兑换码？」→ /library
 *
 * 业务行为不变：解锁态仍由客户端实时向 /api/daily-access 校验
 * （登录用户走账号权益，游客用本地已核销码）。
 */
export default function DailyPickHero({ teaser, isToday, isDemo }: DailyPickHeroProps) {
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
    <section className="px-page" aria-label="每日推荐">
      <div className="mx-auto max-w-wide lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-12">
        {/* 封面 + 角标 + tagline 叠层（桌面为右列） */}
        <CoverImage
          src={teaser.cover_url}
          alt={`${teaser.title} 封面`}
          ratio="video"
          className="overflow-hidden rounded-hero lg:order-2"
          fallbackStyle={
            !teaser.cover_url && teaser.accent_color
              ? { background: teaser.accent_color }
              : undefined
          }
          overlay={
            <>
              <span className="absolute left-3 top-3">
                <Badge tone="on-image" size="sm">
                  {isToday ? '今日更新' : `${formatPickDate(teaser.pick_date)}更新`}
                </Badge>
              </span>
              {status !== 'checking' && (
                <span className="absolute right-3 top-3">
                  {unlocked ? (
                    <Badge tone="success-solid" size="sm">
                      <CheckCircle2 className="h-3 w-3" aria-hidden />
                      已解锁
                    </Badge>
                  ) : (
                    <Badge tone="on-image" size="sm">
                      <Lock className="h-3 w-3" aria-hidden />
                      未解锁
                    </Badge>
                  )}
                </span>
              )}
              {teaser.subtitle && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-apple-scrim-image to-transparent px-4 pb-3 pt-10">
                  <p className="text-sm font-medium leading-snug text-white">
                    {teaser.subtitle}
                  </p>
                </div>
              )}
            </>
          }
        />

        {/* 内容区（桌面为左列） */}
        <div className="pt-5 lg:order-1 lg:pt-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-apple-blue">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            每日推荐
            {isDemo && (
              <Badge tone="blue" size="sm">
                演示数据
              </Badge>
            )}
          </p>
          <h2 className="mt-2 text-2xl font-semibold leading-[1.15] text-apple-text sm:text-editorial-title lg:text-editorial-display">
            {teaser.title}
          </h2>

          {status === 'checking' ? (
            <div className="mt-4 space-y-2.5">
              <div className="skeleton h-4 w-2/3 rounded-md" />
              <div className="skeleton h-11 w-full rounded-btn" />
            </div>
          ) : unlocked ? (
            <Button variant="primary" size="lg" fullWidth className="mt-4" href="/library">
              查看今日更新 <span aria-hidden>›</span>
            </Button>
          ) : (
            <>
              <p className="mt-3 flex items-start gap-1.5 text-md leading-relaxed text-apple-text-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-apple-text-3" aria-hidden />
                {status.expired
                  ? '每日计划已过期，续费后继续查看每日更新与历史仓库'
                  : '订阅每日计划开启 · 每天更新 1 期精选内容，解锁后可看全部历史'}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Button variant="primary" size="lg" href="/subscription">
                  {status.expired ? '立即续费' : '订阅每日计划开启'}
                </Button>
                <Button variant="ghost" size="md" href="/library">
                  已有兑换码？
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

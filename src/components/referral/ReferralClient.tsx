'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Gift, RefreshCw, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import GlassSurface from '@/components/ui/GlassSurface';
import Surface from '@/components/ui/Surface';

interface ReferralReward {
  name: string;
  type: 'fixed' | 'percent';
  value: number;
  min_amount: number;
}

interface ReferralOverview {
  share_text?: string | null;
  restricted?: boolean;
  restriction_reason?: string | null;
  settings?: {
    reward_delay_hours?: number;
    require_first_order?: boolean;
    min_order_amount?: number;
    manual_review?: boolean;
  } | null;
  enabled: boolean;
  code: string | null;
  stats: {
    invited: number;
    review: number;
    rewarded: number;
    rejected: number;
  };
  reward: ReferralReward | null;
  recent: Array<{
    id: string;
    status: 'registered' | 'review' | 'rewarded' | 'rejected';
    registered_at: string;
    qualified_at: string | null;
    rewarded_at: string | null;
    rejection_reason: string | null;
    risk_rule: string | null;
    coupon_name: string | null;
  }>;
}

const DEFAULT_SHARE_TEXT =
  '我在 ZORVIN 发现了一个很高级的数字内容商店，用我的专属链接注册即可领取新人奖励：{link}';

type ProgressState = 'done' | 'active' | 'pending';
type ProgressStep = { label: string; state: ProgressState };

const STATUS_LABEL: Record<string, string> = {
  registered: '等待条件',
  review: '待审核',
  rewarded: '已发奖励',
  rejected: '未通过',
};

function rewardText(reward: ReferralReward | null): string {
  if (!reward) return '奖励配置中';
  const value = reward.type === 'percent' ? `${Number(reward.value)}%` : `¥${Number(reward.value).toFixed(2)}`;
  const threshold = Number(reward.min_amount) > 0 ? ` · 满 ¥${Number(reward.min_amount).toFixed(2)}` : '';
  return `${value}${threshold}`;
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  const time = Date.parse(value);
  if (Number.isNaN(time)) return '—';
  return new Date(time).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function rejectionReasonText(value: string | null): string {
  switch (value) {
    case 'inviter_limit':
      return '超过推广人奖励上限';
    case 'device_limit':
      return '同设备邀请超过阈值';
    case 'ip_limit':
      return '同 IP 邀请超过阈值';
    case 'manual_reject':
      return '人工审核未通过';
    case 'referral_restriction':
      return '推广奖励权限受限';
    case 'reward_failed':
      return '奖励发放失败';
    case 'REFERRAL_COUPON_LIMIT':
      return '奖励优惠券已达限领数量';
    default:
      return value ?? '风控审核未通过';
  }
}

function statusText(invite: ReferralOverview['recent'][number], delayHours = 0): string {
  if (invite.status !== 'registered') return STATUS_LABEL[invite.status] ?? invite.status;
  const readyAt = Date.parse(invite.registered_at) + delayHours * 3600 * 1000;
  return Date.now() < readyAt ? '冷却中' : '等待条件';
}

function inviteProgress(
  invite: ReferralOverview['recent'][number],
  manualReview = false,
): Array<{ label: string; state: 'done' | 'active' | 'pending' }> {
  const registered = invite.status !== 'rejected';
  const conditionsMet = invite.qualified_at !== null || invite.status === 'rewarded';
  const rewarded = invite.status === 'rewarded';
  const riskState: ProgressState = invite.status === 'registered' ? 'active' : 'done';
  const manualState: ProgressState = invite.status === 'review'
    ? 'active'
    : rewarded
      ? 'done'
      : 'pending';
  const rewardState: ProgressState = rewarded
    ? 'done'
    : invite.status === 'review' && !manualReview
      ? 'active'
      : 'pending';
  const steps: ProgressStep[] = [
    { label: '邀请成功', state: registered ? 'done' : 'done' },
    { label: '风控延迟', state: riskState },
    { label: '首单完成', state: conditionsMet ? 'done' : 'pending' },
  ];
  if (manualReview) {
    steps.push({ label: '待人工审核', state: manualState });
  }
  steps.push({ label: '发放奖励', state: rewardState });
  return steps;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.readOnly = false;
  textArea.contentEditable = 'true';
  textArea.style.position = 'fixed';
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.width = '1px';
  textArea.style.height = '1px';
  textArea.style.padding = '0';
  textArea.style.border = 'none';
  textArea.style.outline = 'none';
  textArea.style.boxShadow = 'none';
  textArea.style.background = 'transparent';
  textArea.style.opacity = '0';
  textArea.style.fontSize = '16px';
  textArea.style.whiteSpace = 'pre';
  document.body.appendChild(textArea);

  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, text.length);
  const range = document.createRange();
  range.selectNodeContents(textArea);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  document.body.removeChild(textArea);
  activeElement?.focus();
  return copied;
}

/** 用户推广计划：专属链接、邀请进度与奖励记录 */
export default function ReferralClient() {
  const { user, loading, configured, getAuthHeaders } = useAuth();
  const [overview, setOverview] = useState<ReferralOverview | null>(null);
  const [origin, setOrigin] = useState('');
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => {
    if (!origin || !overview?.code) return '';
    return `${origin}/?ref=${overview.code}`;
  }, [origin, overview?.code]);

  const load = useCallback(async () => {
    if (!user) {
      setOverview(null);
      return;
    }
    setLoadingData(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/referrals/me', { headers });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? '推广计划加载失败');
      }
      setOverview((await res.json()) as ReferralOverview);
    } catch (e) {
      setError(e instanceof Error ? e.message : '推广计划加载失败');
      setOverview(null);
    } finally {
      setLoadingData(false);
    }
  }, [getAuthHeaders, user]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!loading && user) void load();
  }, [loading, user, load]);

  const copyLink = async () => {
    if (!shareUrl) return;
    const rawText = overview?.share_text?.trim() || DEFAULT_SHARE_TEXT;
    const shareText = rawText.includes('{link}')
      ? rawText.replace('{link}', shareUrl)
      : `${rawText}${shareUrl}`;
    const copied = await copyTextToClipboard(shareText);
    if (copied) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } else {
      setError('复制失败，请长按链接手动复制');
      window.setTimeout(() => setError(''), 2600);
    }
  };

  if (!configured) {
    return (
      <Surface radius="card-lg" className="p-6 text-center">
        <p className="text-lg font-semibold text-apple-text">推广计划暂未开放</p>
        <p className="mt-2 text-sm leading-relaxed text-apple-text-2">当前站点未配置登录服务。</p>
      </Surface>
    );
  }

  if (loading || loadingData) {
    return (
      <Surface radius="card-lg" className="p-6">
        <div className="skeleton h-24 rounded-2xl" />
      </Surface>
    );
  }

  if (!user) {
    return (
      <Surface radius="card-lg" className="p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-apple-blue-soft">
          <Gift className="h-5 w-5 text-apple-blue" aria-hidden />
        </span>
        <p className="mt-3 text-lg font-semibold text-apple-text">登录后开启推广计划</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-apple-text-2">
          复制专属链接给好友，好友注册并满足条件后，你可以获得优惠券奖励。
        </p>
        <Link
          href="/login?from=/referrals"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-btn bg-apple-blue px-6 text-sm font-medium text-white active:scale-95"
        >
          去登录
        </Link>
      </Surface>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <GlassSurface tint="prism" radius="hero" sweep>
        <div className="p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[15px] font-semibold text-apple-text">
                <Users className="h-4 w-4" aria-hidden />
                推广计划
              </div>
              <p className="mt-2 max-w-md text-[13px] leading-relaxed text-apple-text-2">
                把你的专属链接分享给好友。好友注册并满足条件后，奖励会自动进入「我的券」。
              </p>
              <p className="mt-2 text-[12.5px] text-apple-text-3">当前奖励：{rewardText(overview?.reward ?? null)}</p>
            </div>
            <div className="grid w-full max-w-md grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label: '有效邀请', value: overview?.stats.invited ?? 0 },
                { label: '待审核', value: overview?.stats.review ?? 0 },
                { label: '已发奖励', value: overview?.stats.rewarded ?? 0 },
                { label: '未通过', value: overview?.stats.rejected ?? 0 },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/45 bg-white/55 p-3">
                  <p className="text-[11.5px] text-apple-text-2">{item.label}</p>
                  <p className="mt-1 text-[18px] font-semibold tabular-nums text-apple-text">
                    {item.value.toLocaleString('zh-CN')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/45 bg-white/65 p-4">
            <p className="text-[12px] font-medium text-apple-text-2">我的推广链接</p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-apple-border bg-white px-3 py-2">
                <p className="truncate font-mono text-[13px] text-apple-text">{shareUrl || '正在生成…'}</p>
              </div>
              <button
                type="button"
                onClick={() => void copyLink()}
                disabled={!shareUrl}
                className="referral-rainbow-button inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-btn px-5 text-sm font-medium disabled:opacity-40"
              >
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied ? '已复制' : '复制链接'}
              </button>
            </div>
            {overview && !overview.enabled && (
              <p className="mt-2 text-[12px] text-apple-text-3">推广计划暂时关闭，链接暂不计入邀请。</p>
            )}
            {overview?.restricted && (
              <p className="mt-2 rounded-xl border border-[#F3C2C7] bg-[#FDF2F3] px-3 py-2 text-[12px] leading-relaxed text-[#810B17]">
                推广奖励权限受限：{overview.restriction_reason ?? '账号推广奖励待审核'}
              </p>
            )}
          </div>
        </div>
      </GlassSurface>

      {error && (
        <div className="rounded-card border border-[#F3C2C7] bg-[#FDF2F3] p-4 text-[13.5px] leading-relaxed text-[#810B17]">
          {error}
        </div>
      )}

      <section className="rounded-card border border-apple-border bg-apple-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-apple-text">邀请进度</h2>
            <p className="mt-1 text-[12.5px] text-apple-text-2">
              邀请成功 → 风控延迟 → 首单完成
              {overview?.settings?.manual_review ? ' → 待人工审核' : ''} → 发放奖励。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-apple-border bg-white px-4 text-[13px] font-medium text-apple-text transition hover:bg-apple-bg active:scale-[0.98]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            刷新
          </button>
        </div>

        {!overview || overview.recent.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-apple-text-2">还没有邀请记录，复制链接开始吧。</p>
        ) : (
          <div className="divide-y divide-apple-hairline overflow-hidden rounded-card border border-apple-border bg-white">
            {overview.recent.map((invite) => (
              <div key={invite.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] text-apple-text">
                      {formatTime(invite.registered_at)} · {statusText(invite, overview.settings?.reward_delay_hours ?? 0)}
                    </p>
                    {invite.coupon_name && (
                      <p className="mt-1 truncate text-[12px] text-apple-text-3">
                        奖励券：{invite.coupon_name}
                      </p>
                    )}
                  </div>
                  {invite.rewarded_at && (
                    <span className="shrink-0 rounded-full bg-apple-blue-soft px-2.5 py-1 text-[12px] font-medium text-apple-blue">
                      已奖励
                    </span>
                  )}
                </div>

                <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
                  {inviteProgress(invite, Boolean(overview.settings?.manual_review)).map((step, index) => (
                    <li key={step.label} className="flex items-center gap-2">
                      {index > 0 && <span aria-hidden className="text-apple-text-3">→</span>}
                      <span
                        className={
                          step.state === 'done'
                            ? 'text-apple-text'
                            : step.state === 'active'
                              ? 'font-medium text-apple-blue'
                              : 'text-apple-text-3'
                        }
                      >
                        {step.label}
                      </span>
                    </li>
                  ))}
                </ol>

                {invite.status === 'rejected' && (
                  <p className="mt-2 text-[12px] leading-relaxed text-[#B80012]">
                    原因：{rejectionReasonText(invite.risk_rule ?? invite.rejection_reason)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

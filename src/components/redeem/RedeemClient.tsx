'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Sparkles,
  UserPlus,
  Video,
} from 'lucide-react';
import { classifyMedia } from '@/lib/upload';
import { useAuth } from '@/lib/auth-context';
import { useLocalLibrary } from '@/lib/unlocks';

/** POST /api/redeem 成功响应（迁移 005 起区分兑换类型） */
interface RedeemResultBase {
  result_type: 'content' | 'unlock';
  product_name: string;
  /** true = 本次核销；false = 该码此前已兑换过（重复查看） */
  redeemed_now: boolean;
  /** 服务端是否识别到登录态并完成绑定（false = 游客，提示注册） */
  bound: boolean;
}

/** content 类兑换结果：展示图片 / 视频 / 文档 */
interface ContentResult extends RedeemResultBase {
  result_type: 'content';
  product_description: string | null;
  image_url: string;
}

/** unlock_daily 类兑换结果：解锁每日计划 + 有效期 */
interface UnlockResult extends RedeemResultBase {
  result_type: 'unlock';
  /** true = 永久有效；否则以 expires_at 为准 */
  permanent: boolean;
  expires_at: string | null;
}

type RedeemResult = ContentResult | UnlockResult;

type Status = 'idle' | 'loading' | 'error' | 'result';

/** 到期时间 → YYYY-MM-DD（仅日期；非法值返回空串） */
function formatExpiry(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 未登录时的注册引导横幅（游客兑换成功结果下方展示） */
function RegisterBanner() {
  return (
    <Link
      href="/login"
      className="mt-4 flex items-start gap-3 rounded-card border border-apple-blue/25 bg-apple-blue-soft/60 p-4 transition hover:bg-apple-blue-soft"
    >
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-apple-blue/10">
        <UserPlus className="h-4 w-4 text-apple-blue" aria-hidden />
      </span>
      <span>
        <span className="block text-[14px] font-semibold text-apple-text">
          注册账号，永久保存你的权益
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-apple-text-2">
          当前为游客兑换，换设备可能丢失。注册 / 登录后可同步到「我的库」，随时找回。
        </span>
      </span>
    </Link>
  );
}

/**
 * 兑换交互：输入卡密 → 调 /api/redeem（登录时携带 Bearer 顺带绑定账号）→
 * 按结果类型展示：
 * - content：兑换内容（图片 / 视频 / 文档）
 * - unlock：每日计划解锁成功卡（有效期 / 永久）+「查看今日推荐」
 * 游客兑换成功时强提示注册；兑换记录写入本地库（登录后经「我的库」同步）。
 */
export default function RedeemClient() {
  const { getAuthHeaders } = useAuth();
  const { setDailyPlan, addContent } = useLocalLibrary();

  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === 'loading') return;
    const trimmed = code.trim();
    if (!trimmed) {
      setErrorMsg('请输入兑换码');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setErrorMsg('');
    try {
      const headers = await getAuthHeaders(); // 登录 → 携带 Bearer 顺带绑定账号
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as
        | (RedeemResult & { error?: string })
        | null;
      if (!res.ok) {
        throw new Error(data?.error ?? '兑换失败，请稍后再试');
      }
      if (!data) throw new Error('兑换失败，请稍后再试');

      // 游客兑换：写入本地库（作为凭证 + 登录后同步的依据）；
      // 已登录（bound=true）时权益已由服务端落库，无需再写本地，避免冗余同步提示。
      if (!data.bound) {
        if (data.result_type === 'unlock') {
          setDailyPlan({
            code: trimmed,
            redeemed_at: new Date().toISOString(),
            expires_at: data.expires_at,
          });
        } else {
          addContent({
            code: trimmed,
            name: data.product_name,
            description: data.product_description,
            media_url: data.image_url,
            redeemed_at: new Date().toISOString(),
          });
        }
      }

      setResult(data);
      setImgFailed(false);
      setStatus('result');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '兑换失败，请稍后再试');
      setStatus('error');
    }
  };

  const reset = () => {
    setCode('');
    setResult(null);
    setErrorMsg('');
    setImgFailed(false);
    setStatus('idle');
  };

  if (status === 'result' && result) {
    if (result.result_type === 'unlock') {
      return (
        <div className="mx-auto max-w-md px-5">
          <div className="rounded-card border border-apple-border bg-apple-card p-5 shadow-card">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#1B7F3B]/10">
                <CheckCircle2 className="h-5 w-5 text-[#1B7F3B]" aria-hidden />
              </span>
              <p className="text-[15px] font-semibold text-apple-text">
                {result.redeemed_now ? '每日计划解锁成功' : '每日计划已解锁'}
              </p>
            </div>

            <p className="mt-4 text-[17px] font-bold leading-snug text-apple-text">
              {result.product_name}
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[13.5px] leading-relaxed text-apple-text-2">
              <Sparkles className="h-4 w-4 shrink-0 text-apple-blue" aria-hidden />
              {result.permanent
                ? '永久有效 · 每天更新 1 期精选内容，可看全部历史仓库'
                : `有效期至 ${formatExpiry(result.expires_at)} · 每天更新 1 期精选内容`}
            </p>

            <Link
              href="/daily"
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-btn bg-apple-blue px-5 text-[15px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.3)] transition-[background-color,transform] duration-200 ease-apple hover:bg-apple-blue-hover active:scale-[0.99] active:bg-apple-blue-active"
            >
              查看今日推荐
            </Link>
          </div>

          {!result.bound && <RegisterBanner />}

          <button
            type="button"
            onClick={reset}
            className="mt-4 w-full rounded-btn border border-apple-border bg-white py-3 text-[15px] font-medium text-apple-text transition-colors duration-200 ease-apple hover:bg-apple-bg active:bg-apple-surface"
          >
            兑换其他卡密
          </button>
        </div>
      );
    }

    const kind = classifyMedia(result.image_url);
    const openLabel =
      kind === 'image'
        ? '在新标签页打开图片'
        : kind === 'video'
          ? '在新标签页打开视频'
          : '在新标签页打开文档';
    return (
      <div className="mx-auto max-w-md px-5">
        <div className="rounded-card border border-apple-border bg-apple-card p-5 shadow-card">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#1B7F3B]/10">
              <CheckCircle2 className="h-5 w-5 text-[#1B7F3B]" aria-hidden />
            </span>
            <p className="text-[15px] font-semibold text-apple-text">
              {result.redeemed_now ? '兑换成功' : '该卡密已兑换过，以下为兑换内容'}
            </p>
          </div>

          <p className="mt-4 text-[17px] font-bold leading-snug text-apple-text">
            {result.product_name}
          </p>
          {result.product_description && (
            <p className="mt-1 text-[13px] leading-relaxed text-apple-text-2">
              {result.product_description}
            </p>
          )}

          <div className="mt-4 overflow-hidden rounded-card border border-apple-hairline bg-apple-bg">
            {imgFailed ? (
              <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 text-apple-text-3">
                {kind === 'video' ? (
                  <Video className="h-8 w-8" aria-hidden />
                ) : kind === 'doc' ? (
                  <FileText className="h-8 w-8" aria-hidden />
                ) : (
                  <ImageIcon className="h-8 w-8" aria-hidden />
                )}
                <p className="text-[13px]">加载失败，请点下方链接在新标签页打开</p>
              </div>
            ) : kind === 'video' ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={result.image_url}
                controls
                playsInline
                className="max-h-[70dvh] w-full bg-black"
                onError={() => setImgFailed(true)}
              />
            ) : kind === 'doc' ? (
              <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 text-apple-text-2">
                <FileText className="h-10 w-10" aria-hidden />
                <p className="text-[13px] font-medium">文档类兑换内容</p>
                <p className="px-6 text-center text-[12px] text-apple-text-3">
                  请点下方链接在新标签页打开查看
                </p>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.image_url}
                alt={`${result.product_name} 兑换内容`}
                className="w-full"
                onError={() => setImgFailed(true)}
              />
            )}
          </div>

          <a
            href={result.image_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
          >
            {openLabel}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>

        {!result.bound && <RegisterBanner />}

        <button
          type="button"
          onClick={reset}
          className="mt-4 w-full rounded-btn border border-apple-border bg-white py-3 text-[15px] font-medium text-apple-text transition-colors duration-200 ease-apple hover:bg-apple-bg active:bg-apple-surface"
        >
          兑换其他卡密
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-5">
      <form onSubmit={handleSubmit} className="space-y-3">
        <label htmlFor="redeem-code" className="sr-only">
          兑换码
        </label>
        <input
          id="redeem-code"
          className="w-full rounded-xl border border-apple-border bg-white px-4 py-3 font-mono text-[15px] text-apple-text placeholder:text-apple-text-3 focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="请输入兑换码"
          maxLength={500}
          autoComplete="off"
          spellCheck={false}
          disabled={status === 'loading'}
        />
        {status === 'error' && errorMsg && (
          <p className="text-[13px] text-[#D70015]" role="alert">
            {errorMsg}
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded-btn bg-apple-blue py-3 text-[15px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.3)] transition-[background-color,transform] duration-200 ease-apple hover:bg-apple-blue-hover active:scale-[0.99] active:bg-apple-blue-active disabled:cursor-not-allowed disabled:bg-apple-border disabled:text-apple-text-3"
          disabled={status === 'loading'}
        >
          {status === 'loading' ? '兑换中…' : '兑换'}
        </button>
      </form>

      <p className="mt-6 text-[12.5px] leading-relaxed text-apple-text-3">
        在第三方平台付款后会收到一串卡密，把它输入到上面即可完成兑换；
        兑换过的卡密可以重复输入查看内容。登录账号兑换可同步到「我的库」。
      </p>
    </div>
  );
}

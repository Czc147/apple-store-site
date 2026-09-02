'use client';

import { useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Video,
} from 'lucide-react';
import { classifyMedia } from '@/lib/upload';

/** POST /api/redeem 成功响应 */
interface RedeemResult {
  product_name: string;
  product_description: string | null;
  image_url: string;
  /** true = 本次核销；false = 该码此前已兑换过（重复查看） */
  redeemed_now: boolean;
}

type Status = 'idle' | 'loading' | 'error' | 'result';

/**
 * 兑换交互：输入卡密 → 调 /api/redeem → 展示兑换商品（图片 / 视频 / 文档）。
 * 已发放过的卡密可重复输入查看内容（redeemed_now=false 时提示「已兑换过」）；
 * 无效码统一展示「兑换码不正确」。
 */
export default function RedeemClient() {
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
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as
        | (RedeemResult & { error?: string })
        | null;
      if (!res.ok) {
        throw new Error(data?.error ?? '兑换失败，请稍后再试');
      }
      if (!data) throw new Error('兑换失败，请稍后再试');
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
        兑换过的卡密可以重复输入查看内容。
      </p>
    </div>
  );
}

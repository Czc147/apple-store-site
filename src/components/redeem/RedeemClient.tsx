'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, FileText, Image as ImageIcon, Sparkles, Video } from 'lucide-react';
import { classifyMedia } from '@/lib/upload';
import { useAuth } from '@/lib/auth-context';
import { useLocalLibrary } from '@/lib/unlocks';
import { formatExpiry } from '@/lib/format';
import Button from '@/components/ui/Button';
import Message from '@/components/ui/Message';
import Surface from '@/components/ui/Surface';
import TextField from '@/components/ui/TextField';
import ExternalLinkAction from '@/components/ui/ExternalLinkAction';
import RegisterBanner from '@/components/ui/RegisterBanner';

/** POST /api/redeem 成功响应（迁移 005 起区分兑换类型） */
interface RedeemResultBase {
  result_type: 'content' | 'unlock' | 'subscription';
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

/** 普通订阅类兑换结果：订阅入库（「我的库 → 我的订阅」）+ 有效期 */
interface SubscriptionResult extends RedeemResultBase {
  result_type: 'subscription';
  permanent: boolean;
  expires_at: string | null;
}

type RedeemResult = ContentResult | UnlockResult | SubscriptionResult;

type Status = 'idle' | 'loading' | 'error' | 'result';

/**
 * 权益类兑换结果卡外壳（每日计划解锁 / 订阅解锁共用）：
 * 成功图标 + 标题 + 权益名 + 一行有效期说明，children 追加 CTA 等。
 */
function EntitlementResultCard({
  title,
  name,
  line,
  children,
}: {
  title: string;
  name: string;
  line: string;
  children?: ReactNode;
}) {
  return (
    <Surface radius="card" className="p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-apple-success-soft">
          <CheckCircle2 className="h-5 w-5 text-apple-success" aria-hidden />
        </span>
        <p className="text-md font-semibold text-apple-text">{title}</p>
      </div>

      <p className="mt-4 text-lg font-bold leading-snug text-apple-text">{name}</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-sm leading-relaxed text-apple-text-2">
        <Sparkles className="h-4 w-4 shrink-0 text-apple-blue" aria-hidden />
        {line}
      </p>

      {children}
    </Surface>
  );
}

/**
 * 兑换交互（内嵌于「我的库」）：输入卡密 → 调 /api/redeem（登录时携带
 * Bearer 顺带绑定账号）→ 按结果类型展示：
 * - content：兑换内容（图片 / 视频 / 文档）
 * - unlock：每日计划解锁成功卡（有效期 / 永久）+「查看今日推荐」
 * - subscription：订阅解锁成功卡（有效期 / 永久），内容在「我的库 → 我的订阅」
 * 游客兑换成功时强提示注册（RegisterBanner 共享组件）；
 * 兑换记录写入本地库（登录后经「我的库」同步）。
 *
 * Phase 10 收敛：私有绿 #1B7F3B → success token；CTA/次级钮手抄类串 → Button；
 * 裸红错误文字 → Message(error)；输入框 → TextField；外链 → ExternalLinkAction；
 * RegisterBanner 与 LibraryClient 游客横幅合并为共享组件。兑换逻辑逐行保留。
 */
export default function RedeemClient({ onRedeemed }: { onRedeemed?: () => void }) {
  const { getAuthHeaders } = useAuth();
  const { setDailyPlan, addSubscription, addContent } = useLocalLibrary();

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
        } else if (data.result_type === 'subscription') {
          addSubscription({
            code: trimmed,
            name: data.product_name,
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
      onRedeemed?.();
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
        <div className="w-full">
          <EntitlementResultCard
            title={result.redeemed_now ? '每日计划解锁成功' : '每日计划已解锁'}
            name={result.product_name}
            line={
              result.permanent
                ? '永久有效 · 每天更新 1 期精选内容，可看全部历史仓库'
                : `有效期至 ${formatExpiry(result.expires_at)} · 每天更新 1 期精选内容`
            }
          >
            {/* 死循环链接已修：/daily 重定向回 /library，今日推荐在首页 Hero 区 */}
            <Button variant="primary" size="lg" fullWidth className="mt-5" href="/">
              查看今日推荐
            </Button>
          </EntitlementResultCard>

          {!result.bound && <RegisterBanner className="mt-4" />}

          <Button variant="secondary" size="lg" fullWidth className="mt-4" onClick={reset}>
            兑换其他卡密
          </Button>
        </div>
      );
    }

    if (result.result_type === 'subscription') {
      // 订阅内容不在兑换页展示（都在「我的库 → 我的订阅」），只回执解锁结果
      const validity = result.permanent
        ? '永久有效'
        : `有效期至 ${formatExpiry(result.expires_at)}`;
      return (
        <div className="w-full">
          <EntitlementResultCard
            title={result.redeemed_now ? '订阅解锁成功' : '该卡密已兑换过，订阅已在你的库中'}
            name={result.product_name}
            line={
              result.bound
                ? `${validity} · 内容已存入「我的库 → 我的订阅」`
                : `${validity} · 注册账号后可永久保存，换设备也能找回`
            }
          />

          {!result.bound && <RegisterBanner className="mt-4" />}

          <Button variant="secondary" size="lg" fullWidth className="mt-4" onClick={reset}>
            兑换其他卡密
          </Button>
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
      <div className="w-full">
        <Surface radius="card" className="p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-apple-success-soft">
              <CheckCircle2 className="h-5 w-5 text-apple-success" aria-hidden />
            </span>
            <p className="text-md font-semibold text-apple-text">
              {result.redeemed_now ? '兑换成功' : '该卡密已兑换过，以下为兑换内容'}
            </p>
          </div>

          <p className="mt-4 text-lg font-bold leading-snug text-apple-text">
            {result.product_name}
          </p>
          {result.product_description && (
            <p className="mt-1 text-sm leading-relaxed text-apple-text-2">
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
                <p className="text-sm">加载失败，请点下方链接在新标签页打开</p>
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
                <p className="text-sm font-medium">文档类兑换内容</p>
                <p className="px-6 text-center text-xs text-apple-text-3">
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

          <ExternalLinkAction href={result.image_url} className="mt-3">
            {openLabel}
          </ExternalLinkAction>
        </Surface>

        {!result.bound && <RegisterBanner className="mt-4" />}

        <Button variant="secondary" size="lg" fullWidth className="mt-4" onClick={reset}>
          兑换其他卡密
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="space-y-3">
        <TextField
          id="redeem-code"
          label="兑换码"
          srLabel
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="请输入兑换码"
          maxLength={500}
          autoComplete="off"
          spellCheck={false}
          disabled={status === 'loading'}
          className="font-mono"
        />
        {status === 'error' && errorMsg && <Message tone="error">{errorMsg}</Message>}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          type="submit"
          loading={status === 'loading'}
        >
          兑换
        </Button>
      </form>

      <p className="mt-6 text-xs leading-relaxed text-apple-text-3">
        在「订阅」页购买、或向客服获取卡密后，把它输入到上面即可完成兑换；
        兑换过的卡密可以重复输入查看内容。登录账号兑换可同步到「我的库」。
      </p>
    </div>
  );
}

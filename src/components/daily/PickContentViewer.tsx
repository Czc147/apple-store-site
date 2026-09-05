'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, FileText, RefreshCw, Video } from 'lucide-react';
import { fetchDailyContent, type DailyContent } from '@/lib/daily-client';

type Entry = DailyContent | 'loading' | 'error';

interface PickContentViewerProps {
  pickDate: string;
  /** 凭证指纹（user.id 或 游客码），变化时重新取内容 */
  authKey: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
  /** 游客凭证码（登录用户可为 null） */
  code: string | null;
}

/**
 * 单期每日推荐正文查看器（解锁后可用）：
 * 挂载即向 /api/daily-content 换取 1 小时签名链接并渲染；
 * 图片/文档按类型展示，跳转链接始终提供「打开」按钮；
 * 媒体加载失败（签名过期等）可一键重新获取。
 */
export default function PickContentViewer({
  pickDate,
  authKey,
  getAuthHeaders,
  code,
}: PickContentViewerProps) {
  const [entry, setEntry] = useState<Entry>('loading');
  const [mediaFailed, setMediaFailed] = useState(false);

  const load = useCallback(async () => {
    setEntry('loading');
    setMediaFailed(false);
    const content = await fetchDailyContent(pickDate, getAuthHeaders, code);
    setEntry(content ?? 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickDate, authKey, getAuthHeaders, code]);

  useEffect(() => {
    void load();
  }, [load]);

  if (entry === 'loading') {
    return (
      <div className="space-y-2 py-1">
        <div className="skeleton aspect-[16/10] w-full rounded-card" />
        <div className="skeleton h-3.5 w-1/2 rounded-md" />
      </div>
    );
  }

  if (entry === 'error') {
    return (
      <div className="flex flex-col items-center gap-2 rounded-card bg-apple-bg px-4 py-6 text-center">
        <p className="text-[13px] text-apple-text-2">内容获取失败，请稍后重试</p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-9 items-center gap-1.5 rounded-btn border border-apple-border bg-white px-4 text-[13px] font-medium text-apple-text transition hover:bg-apple-bg active:scale-95"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          重试
        </button>
      </div>
    );
  }

  const content = entry;

  return (
    <div>
      {content.description && (
        <p className="mb-3 whitespace-pre-line text-[13.5px] leading-relaxed text-apple-text-2">
          {content.description}
        </p>
      )}

      {content.media_url && (
        <div className="overflow-hidden rounded-card border border-apple-hairline bg-apple-bg">
          {mediaFailed ? (
            <div className="flex aspect-[16/10] flex-col items-center justify-center gap-2 px-6 text-apple-text-3">
              {content.media_kind === 'video' ? (
                <Video className="h-8 w-8" aria-hidden />
              ) : content.media_kind === 'doc' ? (
                <FileText className="h-8 w-8" aria-hidden />
              ) : (
                <FileText className="h-8 w-8" aria-hidden />
              )}
              <p className="text-center text-[13px]">
                内容加载失败（链接可能已过期），请重新获取
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-btn border border-apple-border bg-white px-4 text-[13px] font-medium text-apple-text transition hover:bg-apple-bg active:scale-95"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                重新获取
              </button>
            </div>
          ) : content.media_kind === 'video' ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={content.media_url}
              controls
              playsInline
              className="max-h-[70dvh] w-full bg-black"
              onError={() => setMediaFailed(true)}
            />
          ) : content.media_kind === 'doc' ? (
            <div className="flex aspect-[16/10] flex-col items-center justify-center gap-2 px-6 text-apple-text-2">
              <FileText className="h-10 w-10" aria-hidden />
              <p className="text-[13px] font-medium">文档类内容</p>
              <p className="text-center text-[12px] text-apple-text-3">
                请点下方链接在新标签页打开查看
              </p>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={content.media_url}
              alt={`${content.title} 内容`}
              className="w-full"
              onError={() => setMediaFailed(true)}
            />
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {content.media_url && (
          <a
            href={content.media_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-apple-blue transition hover:text-apple-blue-hover"
          >
            在新标签页打开
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
        {content.link_url && (
          <a
            href={content.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-btn bg-apple-blue px-4 text-[13px] font-medium text-white transition hover:bg-apple-blue-hover active:scale-[0.98]"
          >
            打开跳转链接
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}

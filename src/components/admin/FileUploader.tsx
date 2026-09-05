'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { FileText, RefreshCw, Trash2, Upload, Video } from 'lucide-react';
import {
  UPLOAD_ACCEPT,
  UPLOAD_RULE_BY_MIME,
  UPLOAD_TYPE_ERROR,
  UPLOAD_HINT,
  KIND_MAX_LABEL,
  classifyMedia,
} from '@/lib/upload';

interface FileUploaderProps {
  /** 当前文件 URL（null 表示未上传；私有桶传签名预览 URL） */
  value: string | null;
  /** 上传成功 → 新 URL（及存储桶内 path，私有桶入库用）；移除 → null */
  onChange: (url: string | null, path?: string | null) => void;
  /** 目标存储桶：images 公开桶（默认）| daily 每日推荐私有桶 */
  bucket?: 'images' | 'daily';
}

/**
 * 兑换商品上传组件（后台表单内嵌使用）
 * - 支持图片 / 视频 / 文档（规则见 lib/upload.ts，服务端二次校验）
 * - XHR 上传以支持真实进度条
 * - 已有内容时按类型预览（图片缩略图 / 视频播放器 / 文档图标），可替换 / 移除
 * - bucket='daily' 时上传到每日推荐私有桶：onChange 第二参返回对象 path（入库用），
 *   url 为 1 小时签名预览链接
 */
export default function FileUploader({ value, onChange, bucket = 'images' }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const uploading = progress !== null;

  const startUpload = (file: File) => {
    const rule = UPLOAD_RULE_BY_MIME[file.type];
    if (!rule) {
      setError(UPLOAD_TYPE_ERROR);
      return;
    }
    if (file.size > rule.max) {
      setError(`该类型文件大小不能超过 ${KIND_MAX_LABEL[rule.kind]}`);
      return;
    }
    setError(null);
    setProgress(0);

    const form = new FormData();
    form.append('file', file);
    if (bucket !== 'images') form.append('bucket', bucket);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (typeof data?.url === 'string' && data.url) {
            onChange(
              data.url,
              typeof data.path === 'string' ? data.path : null,
            );
            return;
          }
        } catch {
          /* fallthrough */
        }
        setError('上传失败：响应解析错误');
        return;
      }
      let msg = `上传失败（HTTP ${xhr.status}）`;
      try {
        const data = JSON.parse(xhr.responseText);
        if (typeof data?.error === 'string' && data.error) msg = data.error;
      } catch {
        /* 保留默认错误文案 */
      }
      setError(msg);
    };
    xhr.onerror = () => {
      setProgress(null);
      setError('网络错误，上传失败');
    };
    xhr.send(form);
  };

  const handlePick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) startUpload(file);
    e.target.value = ''; // 允许重复选择同一文件
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) startUpload(file);
  };

  const openPicker = () => {
    if (!uploading) inputRef.current?.click();
  };

  const kind = value ? classifyMedia(value) : 'image';

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="hidden"
        onChange={handlePick}
        aria-hidden
        tabIndex={-1}
      />

      {!value ? (
        <div
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') openPicker();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
            dragOver
              ? 'border-apple-blue bg-apple-blue-soft'
              : 'border-apple-border bg-apple-bg hover:border-apple-blue/60'
          }`}
        >
          {uploading ? (
            <div className="w-full max-w-[240px]">
              <p className="mb-2 text-[13px] text-apple-text-2">
                上传中 {progress}%
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-apple-border">
                <div
                  className="h-full rounded-full bg-apple-blue transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <Upload className="h-6 w-6 text-apple-text-3" aria-hidden />
              <p className="text-[13px] font-medium text-apple-text">
                点击或拖拽文件到此处上传
              </p>
              <p className="text-[12px] leading-relaxed text-apple-text-3">
                {UPLOAD_HINT}
              </p>
            </>
          )}
        </div>
      ) : (
        <div>
          <div className="relative overflow-hidden rounded-lg border border-apple-border">
            {kind === 'image' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={value}
                alt="已上传内容预览"
                className="h-36 w-full object-cover"
              />
            )}
            {kind === 'video' && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={value}
                controls
                preload="metadata"
                className="h-36 w-full bg-black object-contain"
              />
            )}
            {kind === 'doc' && (
              <div className="flex h-36 w-full flex-col items-center justify-center gap-2 bg-apple-bg px-4 text-apple-text-2">
                <FileText className="h-8 w-8" aria-hidden />
                <p className="w-full truncate text-center text-[12px]">{value}</p>
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 px-6">
                <p className="text-[12px] font-medium text-white">
                  替换上传中 {progress}%
                </p>
                <div className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-white/30">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={openPicker}
              disabled={uploading}
              className="inline-flex h-8 items-center gap-1 rounded-xl border border-apple-border bg-white px-3 text-[12.5px] font-medium text-apple-text transition hover:bg-apple-bg active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" aria-hidden />
              替换
            </button>
            <button
              type="button"
              onClick={() => {
                if (!uploading) onChange(null, null);
              }}
              disabled={uploading}
              className="inline-flex h-8 items-center gap-1 rounded-xl border border-apple-border bg-white px-3 text-[12.5px] font-medium text-[#D70015] transition hover:bg-[#D70015]/5 active:scale-95 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" aria-hidden />
              移除
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-[12.5px] text-[#D70015]" role="alert">
          {error}
        </p>
      )}
      {value && kind === 'video' && (
        <p className="mt-2 flex items-center gap-1 text-[12px] text-apple-text-3">
          <Video className="h-3 w-3" aria-hidden />
          视频文件 · 买家兑换后可播放
        </p>
      )}
    </div>
  );
}

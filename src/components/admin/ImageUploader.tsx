'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';

interface ImageUploaderProps {
  /** 当前图片 URL（null 表示未上传） */
  value: string | null;
  /** 上传成功 → 新 URL；移除 → null */
  onChange: (url: string | null) => void;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPT = 'image/jpeg,image/png,image/webp';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * 通用图片上传组件（后台表单内嵌使用）
 * - 点击 / 拖拽上传到 POST /api/upload（Supabase Storage images 桶）
 * - XHR 上传以支持真实进度条
 * - 客户端预校验格式与大小（服务端会二次校验）
 * - 已有图片时显示预览，可替换 / 移除
 */
export default function ImageUploader({ value, onChange }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const uploading = progress !== null;

  const startUpload = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('仅支持 JPG / PNG / WebP 格式');
      return;
    }
    if (file.size > MAX_SIZE) {
      setError('图片大小不能超过 5MB');
      return;
    }
    setError(null);
    setProgress(0);

    const form = new FormData();
    form.append('file', file);

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
            onChange(data.url);
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

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
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
              <ImagePlus className="h-6 w-6 text-apple-text-3" aria-hidden />
              <p className="text-[13px] font-medium text-apple-text">
                点击或拖拽图片到此处上传
              </p>
              <p className="text-[12px] text-apple-text-3">
                支持 JPG / PNG / WebP，不超过 5MB
              </p>
            </>
          )}
        </div>
      ) : (
        <div>
          <div className="relative overflow-hidden rounded-lg border border-apple-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="已上传图片预览"
              className="h-36 w-full object-cover"
            />
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
                if (!uploading) onChange(null);
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
    </div>
  );
}

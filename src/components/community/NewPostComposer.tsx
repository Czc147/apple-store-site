'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Send, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import CoverImage from '@/components/ui/CoverImage';
import IconButton from '@/components/ui/IconButton';
import { useAuth } from '@/lib/auth-context';
import { uploadPostImage } from '@/lib/community';

/** 配图上限（与 /api/community 的 MAX_IMAGES、迁移 024 的 check 约束一致） */
const MAX_IMAGES = 9;

interface NewPostComposerProps {
  isLoggedIn: boolean;
  onSubmit: (content: string, images: string[]) => Promise<boolean>;
}

/**
 * 发帖输入框：文字 + 配图（迁移 024）。
 * - 图片先传到 `/api/community/upload` 换公开直链，发帖时只提交 URL 数组；
 *   这样发帖接口保持轻量，失败重试也不用重传图。
 * - **纯图帖合法**（发张图不用硬凑文案），所以发布钮的禁用条件是"文字和图都空"。
 * - 与 /api/upload 的区别：那条只认管理员 cookie，用户发图会被 401 挡掉。
 */
export default function NewPostComposer({
  isLoggedIn,
  onSubmit,
}: NewPostComposerProps) {
  const { getAuthHeaders } = useAuth();
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canPublish =
    isLoggedIn &&
    !submitting &&
    !uploading &&
    (draft.trim().length > 0 || images.length > 0);

  const pickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);

    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setUploadError(`最多上传 ${MAX_IMAGES} 张图片`);
      return;
    }
    const picked = Array.from(files).slice(0, room);
    if (files.length > room) {
      setUploadError(`最多上传 ${MAX_IMAGES} 张图片，超出部分已忽略`);
    }

    setUploading(true);
    // 逐张串行上传：并发多张会同时打满 storage，而且失败时不好定位是哪张
    const uploaded: string[] = [];
    for (const file of picked) {
      const url = await uploadPostImage(getAuthHeaders, file);
      if (url) uploaded.push(url);
    }
    setUploading(false);

    if (uploaded.length < picked.length) {
      setUploadError('部分图片上传失败，请重试');
    }
    if (uploaded.length > 0) {
      setImages((prev) => [...prev, ...uploaded].slice(0, MAX_IMAGES));
    }
    // 允许连续选同一张图
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async () => {
    if (!canPublish) return;
    setSubmitting(true);
    const okPost = await onSubmit(draft.trim(), images);
    setSubmitting(false);
    if (okPost) {
      setDraft('');
      setImages([]);
      setUploadError(null);
    }
  };

  return (
    <div className="rounded-card-lg bg-apple-card p-3 sm:p-4">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        readOnly={!isLoggedIn}
        placeholder={isLoggedIn ? '分享点什么吧…' : '登录后即可发帖'}
        rows={2}
        aria-label="发帖内容"
        maxLength={2000}
        className="w-full resize-none rounded-input border border-transparent bg-apple-bg px-3.5 py-2.5 text-md leading-relaxed text-apple-text outline-none transition duration-fast ease-apple placeholder:text-apple-text-3 focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20"
      />

      {/* 已选配图预览 */}
      {images.length > 0 && (
        <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
          {images.map((url, i) => (
            <li key={url} className="relative">
              <CoverImage
                src={url}
                alt={`配图 ${i + 1}`}
                ratio="square"
                sizes="25vw"
                className="rounded-input"
              />
              <IconButton
                icon={X}
                label={`移除配图 ${i + 1}`}
                variant="on-dark"
                iconSize="sm"
                onClick={() => setImages((prev) => prev.filter((u) => u !== url))}
                className="absolute right-0.5 top-0.5 scale-90"
              />
            </li>
          ))}
        </ul>
      )}

      {uploadError && (
        <p className="mt-2 text-2xs text-apple-danger" role="alert">
          {uploadError}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {/*
            —— 视频的口子留在这里（用户 2026-09-22：「去掉上传视频吧，留一个口子
            以后想要添加再加」）。这一版刻意不发视频，将来要加，需要动的是这几处：
              1. 这里 accept 放开 + 一个独立的视频按钮（图标用 lucide 的 Video）；
              2. `pickFiles` 按 MIME 分流，视频走新上传路由或放开
                 /api/community/upload 的 ALLOWED_KINDS（见该文件注释）；
              3. 帖子数据：`community_posts.images` 是 text[]，得能区分图/视频
                 —— 要么加一列 `videos text[]`，要么把数组元素存成
                 `{kind,url}` 的 JSON；
              4. 渲染端 PostImages 现在只认 <img>，要补 <video controls> 分支。
            之所以不"先把上传做了、渲染以后再说"：存进去渲染不出来，
            用户只会以为发失败了，比没有入口更糟。
          */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void pickFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!isLoggedIn || uploading || images.length >= MAX_IMAGES}
            aria-label="添加图片"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-apple-text-2 pressable-soft hover:text-apple-blue disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
          >
            <ImagePlus className="h-[18px] w-[18px]" aria-hidden />
          </button>
          <span className="text-2xs text-apple-text-3">
            {uploading
              ? '图片上传中…'
              : draft.length > 0
                ? `${draft.length}/2000`
                : ''}
          </span>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => void submit()}
          disabled={!canPublish}
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
          {submitting ? '发布中…' : '发布'}
        </Button>
      </div>
    </div>
  );
}

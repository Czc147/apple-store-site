'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { AVATAR_PRESETS } from '@/lib/avatars';
import { resizeImageToJpegFile } from '@/lib/image-resize';
import type { Profile } from './ProfileHeader';

interface ProfileEditSheetProps {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onSaved: (next: Profile) => void;
}

/** 「我的库」资料编辑弹窗：选头像 + 改昵称 → PATCH /api/profile */
export default function ProfileEditSheet({
  open,
  onClose,
  profile,
  getAuthHeaders,
  onSaved,
}: ProfileEditSheetProps) {
  const [name, setName] = useState('');
  const [avatarKey, setAvatarKey] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(profile?.display_name ?? '');
    setAvatarKey(profile?.avatar_key ?? '');
    setAvatarUrl(profile?.avatar_url ?? null);
    setError('');
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    setError('');
    try {
      const jpeg = await resizeImageToJpegFile(file);
      const headers = await getAuthHeaders();
      const form = new FormData();
      form.set('file', jpeg);
      const res = await fetch('/api/profile/avatar', { method: 'POST', headers, body: form });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? '上传失败，请重试');
        return;
      }
      setAvatarUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('昵称不能为空');
      return;
    }
    if (trimmed.length > 20) {
      setError('昵称最多 20 个字符');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ display_name: trimmed, avatar_key: avatarKey, avatar_url: avatarUrl }),
      });
      const data = (await res.json()) as { profile?: Profile; message?: string };
      if (!res.ok || !data.profile) {
        setError(data.message ?? '保存失败，请重试');
        setSaving(false);
        return;
      }
      onSaved(data.profile);
      setSaving(false);
      onClose();
    } catch {
      setError('保存失败，请重试');
      setSaving(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[60] ${
        open
          ? 'visible'
          : 'invisible pointer-events-none [transition:visibility_0s_linear_250ms]'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-edit-sheet-title"
    >
      <div
        aria-hidden
        className={`absolute inset-0 bg-black/45 transition-opacity duration-[250ms] ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <div
        onClick={onClose}
        className="absolute inset-0 flex flex-col items-center justify-end px-4 pb-[calc(72px+env(safe-area-inset-bottom))] pt-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={`relative w-full max-w-[480px] max-h-full overflow-y-auto rounded-hero border border-white/60 shadow-popover transition-[opacity,transform] duration-[250ms] ease-apple ${
            open ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          {/* 毛玻璃背景单独一层，避免和上面 transform/opacity 过渡叠在一起绘制，
              长时间停留（选头像/打字）时才会暴露的 GPU 合成层重绘变灰问题 */}
          <div className="glass pointer-events-none absolute inset-0 -z-10 rounded-hero" aria-hidden />

          <div
            className="absolute left-1/2 top-2.5 h-1 w-9 -translate-x-1/2 rounded-full bg-black/10"
            aria-hidden
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-apple-text-2 transition-colors duration-200 hover:bg-black/10 active:scale-95"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>

          <div className="p-6 pt-7">
            <h3
              id="profile-edit-sheet-title"
              className="text-center text-[17px] font-semibold tracking-tight"
            >
              编辑资料
            </h3>

            <div className="mt-5 flex flex-col items-center gap-2">
              <Avatar avatarKey={avatarKey} avatarUrl={avatarUrl} name={name} size={64} />
              <div className="flex items-center gap-3 text-[12.5px] font-medium">
                <button
                  type="button"
                  onClick={handlePickFile}
                  disabled={uploading}
                  className="text-apple-blue transition disabled:opacity-50"
                >
                  {uploading ? '上传中…' : '从相册选择'}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl(null)}
                    className="text-apple-text-3 transition hover:text-apple-text-2"
                  >
                    移除自定义头像
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleFileChange(e)}
              />
            </div>

            <p className="mt-5 text-[12.5px] font-medium text-apple-text-2">选择头像</p>
            <div className="mt-2 grid grid-cols-6 gap-2.5">
              {AVATAR_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => {
                    setAvatarKey(preset.key);
                    setAvatarUrl(null);
                  }}
                  aria-label={`选择头像 ${preset.key}`}
                  aria-pressed={avatarKey === preset.key && !avatarUrl}
                  className={`flex items-center justify-center rounded-full p-0.5 transition ${
                    avatarKey === preset.key && !avatarUrl
                      ? 'ring-2 ring-apple-blue'
                      : 'ring-1 ring-transparent hover:ring-apple-border'
                  }`}
                >
                  <Avatar avatarKey={preset.key} size={40} />
                </button>
              ))}
            </div>

            <p className="mt-5 text-[12.5px] font-medium text-apple-text-2">昵称</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="输入昵称"
              className="mt-2 h-10 w-full rounded-btn border border-apple-hairline bg-apple-card px-3 text-[14px] text-apple-text outline-none transition focus:border-apple-blue"
            />

            {error && <p className="mt-2 text-[12.5px] text-[#D70015]">{error}</p>}

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="mt-5 w-full rounded-btn bg-apple-blue py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.3)] transition-[background-color,transform] duration-200 ease-apple hover:bg-apple-blue-hover active:scale-[0.99] active:bg-apple-blue-active disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

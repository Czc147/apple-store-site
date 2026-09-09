'use client';

import { useEffect, useRef, useState } from 'react';
import Avatar from '@/components/ui/Avatar';
import BottomSheet from '@/components/ui/BottomSheet';
import Button from '@/components/ui/Button';
import Message from '@/components/ui/Message';
import TextField from '@/components/ui/TextField';
import { AVATAR_PRESETS } from '@/lib/avatars';
import { resizeImageToJpegFile } from '@/lib/image-resize';
import { cn } from '@/lib/cn';
import type { Profile } from './ProfileHeader';

interface ProfileEditSheetProps {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onSaved: (next: Profile) => void;
}

/**
 * 「我的库」资料编辑弹层：选头像 + 改昵称 → PATCH /api/profile。
 * audit 收敛：原平行手搓弹层（非 Portal / 手写 250ms / 遮罩 black/45 /
 * 32px 关闭钮 / ~18px「从相册选择」命中 / 裸 #D70015 错误文字）整体替换为
 * BottomSheet + Button + TextField + Message primitives；
 * 业务逻辑（上传压缩 resizeImageToJpegFile / PATCH / 校验规则）原样保留。
 */
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
    <BottomSheet open={open} onClose={onClose} title="编辑资料">
      <div className="px-6 pb-4 pt-2">
        {/* 当前头像预览 + 上传/移除 */}
        <div className="flex flex-col items-center gap-1">
          <Avatar avatarKey={avatarKey} avatarUrl={avatarUrl} name={name} size={64} />
          <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={handlePickFile} disabled={uploading}>
              {uploading ? '上传中…' : '从相册选择'}
            </Button>
            {avatarUrl && (
              <button
                type="button"
                onClick={() => setAvatarUrl(null)}
                className="-my-1.5 inline-flex min-h-11 items-center rounded-btn px-2 text-xs font-medium text-apple-text-3 transition-colors duration-fast ease-apple hover:text-apple-text-2 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
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

        {/* 预置渐变头像 */}
        <p className="mt-4 text-xs font-medium text-apple-text-2">选择头像</p>
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
              className={cn(
                'flex items-center justify-center rounded-full p-0.5 transition duration-fast ease-apple',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40',
                avatarKey === preset.key && !avatarUrl
                  ? 'ring-2 ring-apple-blue'
                  : 'ring-1 ring-transparent hover:ring-apple-border',
              )}
            >
              <Avatar avatarKey={preset.key} size={40} />
            </button>
          ))}
        </div>

        {/* 昵称 */}
        <TextField
          label="昵称"
          id="profile-nickname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          placeholder="输入昵称"
          radius="btn"
          wrapperClassName="mt-5"
        />

        {error && (
          <Message tone="error" className="mt-3">
            {error}
          </Message>
        )}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="mt-5"
          loading={saving}
          onClick={() => void handleSave()}
        >
          保存
        </Button>
      </div>
    </BottomSheet>
  );
}

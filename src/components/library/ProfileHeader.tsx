'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import ProfileEditSheet from './ProfileEditSheet';

export interface Profile {
  display_name: string;
  avatar_key: string;
  avatar_url: string | null;
}

interface ProfileHeaderProps {
  getAuthHeaders: () => Promise<Record<string, string>>;
  /** 资料未加载出来前的兜底展示（邮箱） */
  fallbackEmail: string;
}

/** 「我的库」顶部账号资料条：头像 + 昵称，点击「编辑」改头像/改名 */
export default function ProfileHeader({ getAuthHeaders, fallbackEmail }: ProfileHeaderProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/profile', { headers });
      if (!res.ok) return;
      const data = (await res.json()) as { profile: Profile };
      setProfile(data.profile);
    } catch {
      /* 加载失败时保留邮箱兜底展示，不阻塞页面 */
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="flex min-w-0 items-center gap-2.5 text-left"
        aria-haspopup="dialog"
      >
        <Avatar
          avatarKey={profile?.avatar_key}
          avatarUrl={profile?.avatar_url}
          name={profile?.display_name ?? fallbackEmail}
          size={40}
        />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold text-apple-text">
            {profile?.display_name ?? fallbackEmail}
          </span>
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-apple-text-3">
            <Pencil className="h-3 w-3" aria-hidden />
            编辑资料
          </span>
        </span>
      </button>

      <ProfileEditSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        profile={profile}
        getAuthHeaders={getAuthHeaders}
        onSaved={(next) => setProfile(next)}
      />
    </>
  );
}

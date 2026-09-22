'use client';

import { useSyncExternalStore } from 'react';
import { soundManager } from './sound-manager';
import { DEFAULT_SOUND_SETTINGS, type SoundSettings } from './types';

/** SSR/首帧快照：固定用默认值，避免水合不一致（真实值在客户端首帧后接上） */
const getServerSnapshot = (): SoundSettings => DEFAULT_SOUND_SETTINGS;

/**
 * 读取/修改提示音设置。
 * 走 useSyncExternalStore 而不是 useState + useEffect：设置面板在别处改了，
 * 所有用到它的组件要同时更新，且刷新后从 localStorage 恢复的值必须直接可用、
 * 不能先渲染默认值再跳一下。
 */
export function useSoundSettings(): [
  SoundSettings,
  (patch: Partial<SoundSettings>) => void,
] {
  const settings = useSyncExternalStore(
    soundManager.subscribe,
    soundManager.getSettings,
    getServerSnapshot,
  );

  return [settings, (patch) => soundManager.updateSettings(patch)];
}

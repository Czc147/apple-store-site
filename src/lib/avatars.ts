/**
 * 默认头像库：纯代码生成的几何渐变头像（无需存储桶/生图工具）。
 * key 需与 supabase/migrations/017_profiles.sql 里的预置数组保持一致
 * （注册触发器 / 回填脚本按同一份 key 列表随机取值）。
 */
export interface AvatarPreset {
  key: string;
  /** 渐变起止色，取自 iOS 系统色板，风格与站内品牌蓝 #0071E3 呼应 */
  from: string;
  to: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { key: 'aurora', from: '#0071E3', to: '#4DA3FF' },
  { key: 'citrus', from: '#FF9500', to: '#FFCB66' },
  { key: 'mint', from: '#00C7BE', to: '#66E5DE' },
  { key: 'coral', from: '#FF375F', to: '#FF7A9C' },
  { key: 'indigo', from: '#5856D6', to: '#9E9CF5' },
  { key: 'sunset', from: '#FF6B6B', to: '#FFA36B' },
  { key: 'sky', from: '#32ADE6', to: '#7FD1F5' },
  { key: 'rose', from: '#FF2D55', to: '#FF7AB8' },
  { key: 'sand', from: '#FFD60A', to: '#E8B86D' },
  { key: 'forest', from: '#34C759', to: '#7FE39A' },
  { key: 'lilac', from: '#AF52DE', to: '#D6A6F5' },
  { key: 'steel', from: '#8E8E93', to: '#B8C4D9' },
];

export const AVATAR_KEYS = AVATAR_PRESETS.map((p) => p.key);

export const DEFAULT_AVATAR_KEY = AVATAR_PRESETS[0].key;

export function getAvatarPreset(key: string | null | undefined): AvatarPreset {
  return AVATAR_PRESETS.find((p) => p.key === key) ?? AVATAR_PRESETS[0];
}

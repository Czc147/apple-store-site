/**
 * 默认头像库：纯代码生成的几何渐变头像（无需存储桶/生图工具）。
 * 本文件是「渲染」的唯一来源（key → 渐变色 + 编辑资料里的选择器）。
 * 注册时随机指派的默认 key 由 DB 侧 migrate 019 的 public.avatar_presets 表提供，
 * 两者共享同一批 key：新增预置渐变时，往该表补一行并在本文件加一组对应的 from/to。
 * 即便一时不同步，getAvatarPreset 对未知 key 也会兜底回第一个渐变，不会渲染坏头像。
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

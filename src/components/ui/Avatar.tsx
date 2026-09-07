'use client';

import { useId } from 'react';
import { getAvatarPreset } from '@/lib/avatars';

interface AvatarProps {
  avatarKey: string | null | undefined;
  /** 自定义上传头像图片 URL；有值时优先于 avatarKey 预置渐变展示 */
  avatarUrl?: string | null;
  /** 无法解析头像时的兜底文案来源（取首字符） */
  name?: string | null;
  /** 直径（px） */
  size?: number;
  className?: string;
}

/**
 * 头像：优先展示用户自定义上传的图片，否则用几何渐变头像
 * （内联 SVG，矢量、零网络请求；渐变圆底 + 两个错位的浅色叠层圆做几何纹样，贴合站内 Apple 风格）。
 */
export default function Avatar({ avatarKey, avatarUrl, name, size = 40, className = '' }: AvatarProps) {
  const gradientId = useId();
  const preset = getAvatarPreset(avatarKey);

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name ? `${name} 的头像` : '用户头像'}
        loading="lazy"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`flex-none rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={`flex-none rounded-full ${className}`}
      role="img"
      aria-label={name ? `${name} 的头像` : '用户头像'}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={preset.from} />
          <stop offset="100%" stopColor={preset.to} />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="20" fill={`url(#${gradientId})`} />
      <circle cx="29" cy="12" r="10" fill="#FFFFFF" opacity="0.16" />
      <circle cx="11" cy="30" r="13" fill="#FFFFFF" opacity="0.12" />
    </svg>
  );
}

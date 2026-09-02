/** 上传（兑换商品）共享规则：服务端 /api/upload 与后台 FileUploader 共用 */

export const MB = 1024 * 1024;

export type UploadKind = 'image' | 'video' | 'doc';

export interface UploadRule {
  mime: string;
  ext: string;
  kind: UploadKind;
  max: number;
}

export const UPLOAD_RULES: UploadRule[] = [
  { mime: 'image/jpeg', ext: 'jpg', kind: 'image', max: 5 * MB },
  { mime: 'image/png', ext: 'png', kind: 'image', max: 5 * MB },
  { mime: 'image/webp', ext: 'webp', kind: 'image', max: 5 * MB },
  { mime: 'image/gif', ext: 'gif', kind: 'image', max: 5 * MB },
  { mime: 'video/mp4', ext: 'mp4', kind: 'video', max: 50 * MB },
  { mime: 'video/webm', ext: 'webm', kind: 'video', max: 50 * MB },
  { mime: 'application/pdf', ext: 'pdf', kind: 'doc', max: 10 * MB },
  { mime: 'text/plain', ext: 'txt', kind: 'doc', max: 10 * MB },
];

export const UPLOAD_RULE_BY_MIME: Record<string, UploadRule> = Object.fromEntries(
  UPLOAD_RULES.map((r) => [r.mime, r]),
);

export const UPLOAD_ACCEPT = UPLOAD_RULES.map((r) => r.mime).join(',');

export const KIND_MAX_LABEL: Record<UploadKind, string> = {
  image: '5MB',
  video: '50MB',
  doc: '10MB',
};

export const UPLOAD_HINT =
  '支持 JPG / PNG / WebP / GIF 图片（≤5MB）、MP4 / WebM 视频（≤50MB）、PDF / TXT 文档（≤10MB）';

export const UPLOAD_TYPE_ERROR =
  '仅支持 JPG / PNG / WebP / GIF 图片、MP4 / WebM 视频、PDF / TXT 文档';

/** 按 URL 扩展名归类媒体（兑换页 / 后台缩略图渲染用） */
export type MediaKind = 'image' | 'video' | 'doc';

export function classifyMedia(url: string): MediaKind {
  const path = url.split('?')[0];
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'mp4' || ext === 'webm') return 'video';
  if (ext === 'pdf' || ext === 'txt') return 'doc';
  return 'image';
}

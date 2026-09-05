import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { UPLOAD_RULE_BY_MIME, UPLOAD_TYPE_ERROR, KIND_MAX_LABEL } from '@/lib/upload';

export const dynamic = 'force-dynamic';

/** 允许上传的目标桶（白名单；daily 为付费内容私有桶，见迁移 005） */
const ALLOWED_BUCKETS = ['images', 'daily'] as const;
type UploadBucket = (typeof ALLOWED_BUCKETS)[number];

/** 桶内路径前缀 */
const BUCKET_PREFIX: Record<UploadBucket, string> = {
  images: 'products',
  daily: 'picks',
};

/** 私有桶预览签名 URL 有效期（秒）——仅供后台表单即时预览 */
const PREVIEW_SIGNED_TTL = 3600;

/**
 * POST /api/upload — 兑换商品 / 图片上传（需登录）
 * 请求：multipart/form-data，字段名 file；可选字段 bucket（images 默认 | daily）
 *       （图片 ≤5MB / 视频 ≤50MB / 文档 ≤10MB，见 lib/upload.ts）
 * 流程：服务端用 service_role 写入对应 Supabase Storage 桶：
 * - images（公开桶）→ 返回 { path, url }，url 为公开直链可入库
 * - daily（私有桶，每日推荐付费内容）→ 返回 { path, url, signed: true }，
 *   url 是 1 小时签名链接仅供后台预览；入库只存 path，
 *   前台访问由 /api/daily-content 校验解锁后现签
 */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || !(file instanceof File)) {
    return fail('需要 multipart/form-data 字段 file');
  }
  const bucketRaw = form?.get('bucket');
  const bucket: UploadBucket =
    typeof bucketRaw === 'string' &&
    (ALLOWED_BUCKETS as readonly string[]).includes(bucketRaw)
      ? (bucketRaw as UploadBucket)
      : 'images';

  const rule = UPLOAD_RULE_BY_MIME[file.type];
  if (!rule) {
    return fail(UPLOAD_TYPE_ERROR);
  }
  if (file.size > rule.max) {
    return fail(`该类型文件大小不能超过 ${KIND_MAX_LABEL[rule.kind]}`);
  }

  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${BUCKET_PREFIX[bucket]}/${Date.now()}-${rand}.${rule.ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin()
    .storage.from(bucket)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });
  if (error) return fail(`上传失败：${error.message}`, 500);

  if (bucket === 'daily') {
    // 私有桶：签一个短时效预览链接给后台表单；入库由调用方只保存 path
    const { data, error: signErr } = await supabaseAdmin()
      .storage.from('daily')
      .createSignedUrl(path, PREVIEW_SIGNED_TTL);
    return ok(
      { path, url: signErr ? null : data.signedUrl, signed: true },
      201,
    );
  }

  const { data } = supabaseAdmin().storage.from('images').getPublicUrl(path);
  return ok({ path, url: data.publicUrl }, 201);
}

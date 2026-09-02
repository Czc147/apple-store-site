import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { UPLOAD_RULE_BY_MIME, UPLOAD_TYPE_ERROR, KIND_MAX_LABEL } from '@/lib/upload';

export const dynamic = 'force-dynamic';

/**
 * POST /api/upload — 兑换商品 / 图片上传（需登录）
 * 请求：multipart/form-data，字段名 file
 *       （图片 ≤5MB / 视频 ≤50MB / 文档 ≤10MB，见 lib/upload.ts）
 * 流程：服务端用 service_role 写入 Supabase Storage `images` 桶
 *       → 返回 { path, url }，url 可直接作为 image_url 入库
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
  const rule = UPLOAD_RULE_BY_MIME[file.type];
  if (!rule) {
    return fail(UPLOAD_TYPE_ERROR);
  }
  if (file.size > rule.max) {
    return fail(`该类型文件大小不能超过 ${KIND_MAX_LABEL[rule.kind]}`);
  }

  const rand = Math.random().toString(36).slice(2, 8);
  const path = `products/${Date.now()}-${rand}.${rule.ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin()
    .storage.from('images')
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });
  if (error) return fail(`上传失败：${error.message}`, 500);

  const { data } = supabaseAdmin().storage.from('images').getPublicUrl(path);
  return ok({ path, url: data.publicUrl }, 201);
}

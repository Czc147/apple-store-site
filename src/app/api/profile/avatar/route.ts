import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 客户端已统一压缩转码为 jpeg，服务端按此白名单拒绝其他类型，防止绕过 */
const ACCEPT_MIME = 'image/jpeg';
const MAX_SIZE = 2 * 1024 * 1024;

/**
 * POST /api/profile/avatar — 上传自定义头像图片（登录，Bearer 鉴权）
 *
 * 只做 storage 写入，不落库：固定路径 avatars/{user_id}.jpg 覆盖式上传，
 * 是否把返回的 URL 写进 profiles.avatar_url 交给调用方随「保存」一起
 * PATCH /api/profile 提交，和「选预置头像先改本地状态、点保存才生效」
 * 的既有交互保持一致。
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || !(file instanceof File)) {
    return fail('需要 multipart/form-data 字段 file');
  }
  if (file.type !== ACCEPT_MIME) {
    return fail('仅支持 JPG 图片');
  }
  if (file.size > MAX_SIZE) {
    return fail('图片大小不能超过 2MB');
  }

  const path = `avatars/${user.id}.jpg`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const db = supabaseAdmin();
  const { error } = await db
    .storage.from('avatars')
    .upload(path, buffer, { contentType: ACCEPT_MIME, upsert: true });
  if (error) return fail(`上传失败：${error.message}`, 500);

  const { data } = db.storage.from('avatars').getPublicUrl(path);
  return ok({ url: `${data.publicUrl}?t=${Date.now()}` }, 201);
}

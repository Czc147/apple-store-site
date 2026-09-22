import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { UPLOAD_RULE_BY_MIME, UPLOAD_TYPE_ERROR, KIND_MAX_LABEL } from '@/lib/upload';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/**
 * 帖子图只允许图片，不接受视频/文档 —— 交流板块是图文分享，不是文件分享。
 *
 * **视频的口子**（用户 2026-09-22：这一版不做，留口子）：
 * `UPLOAD_RULE_BY_MIME` 里本来就有 mp4/webm（后台那条在用），所以放开本身
 * 只需在这里加 `'video'`。但那**只是第一步** —— 光能存没用，帖子渲染端
 * （PostImages）与数据列（`community_posts.images`）都还只认图片，
 * 四步清单见 NewPostComposer 里那段注释。
 */
const ALLOWED_KINDS = ['image'] as const;

/**
 * POST /api/community/upload — 帖子配图上传（登录用户，Bearer 鉴权）
 *
 * 为什么单开一条而不是复用 /api/upload：那条**只认管理员 cookie**
 * （`checkAdmin`），普通用户在交流板块发图会被 401 挡掉。这里走 Bearer，
 * 并且刻意收窄到「只允许图片」——后台那条要传视频/PDF，用户端不需要。
 *
 * 请求：multipart/form-data，字段名 file
 * 响应 201：{ path, url }，url 是 images 公开桶直链，可直接存进
 * community_posts.images（见迁移 024）。
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const user = await getRequestUser(req);
  if (!user) return fail('请先登录后再上传图片', 401);

  // 上传是重操作（要过 storage），限得比发帖紧一些
  if (!rateLimit('community-upload', getClientIp(req), 20, 60_000)) {
    return fail('上传过于频繁，请稍后再试', 429);
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || !(file instanceof File)) {
    return fail('需要 multipart/form-data 字段 file');
  }

  const rule = UPLOAD_RULE_BY_MIME[file.type];
  if (!rule) return fail(UPLOAD_TYPE_ERROR);
  if (!(ALLOWED_KINDS as readonly string[]).includes(rule.kind)) {
    return fail('帖子只支持上传图片');
  }
  if (file.size > rule.max) {
    return fail(`图片大小不能超过 ${KIND_MAX_LABEL[rule.kind]}`);
  }

  const rand = Math.random().toString(36).slice(2, 8);
  // posts/ 前缀与后台商品的 products/ 分开，便于以后按前缀清理
  const path = `posts/${Date.now()}-${rand}.${rule.ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin()
    .storage.from('images')
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return fail(`上传失败：${error.message}`, 500);

  const { data } = supabaseAdmin().storage.from('images').getPublicUrl(path);
  return ok({ path, url: data.publicUrl }, 201);
}

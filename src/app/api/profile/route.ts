import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { AVATAR_KEYS, DEFAULT_AVATAR_KEY } from '@/lib/avatars';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

interface ProfileRow {
  user_id: string;
  display_name: string;
  avatar_key: string;
  avatar_url: string | null;
}

/** avatars 桶 public URL 前缀：校验客户端提交的 avatar_url 确实来自本站上传接口，而非任意外部链接 */
function avatarUrlPrefix(): string {
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/avatars/`;
}

/** 迁移期兜底：理论上注册触发器已建档，这里防御性补建，不依赖触发器一定先跑过 */
async function ensureProfile(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string,
  email: string | null,
): Promise<ProfileRow> {
  const { data } = await db
    .from('profiles')
    .select('user_id, display_name, avatar_key, avatar_url')
    .eq('user_id', userId)
    .maybeSingle();
  if (data) return data as ProfileRow;

  const defaultName = email?.split('@')[0]?.trim() || '用户';
  const randomKey = AVATAR_KEYS[Math.floor(Math.random() * AVATAR_KEYS.length)] ?? DEFAULT_AVATAR_KEY;
  const { data: created, error } = await db
    .from('profiles')
    .upsert(
      { user_id: userId, display_name: defaultName, avatar_key: randomKey },
      { onConflict: 'user_id' },
    )
    .select('user_id, display_name, avatar_key, avatar_url')
    .single();
  if (error || !created) {
    return { user_id: userId, display_name: defaultName, avatar_key: randomKey, avatar_url: null };
  }
  return created as ProfileRow;
}

/** GET /api/profile — 当前用户资料（登录，Bearer 鉴权） */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const profile = await ensureProfile(supabaseAdmin(), user.id, user.email);
  return ok({ profile });
}

/** PATCH /api/profile — 改昵称 / 换头像（登录，Bearer 鉴权） */
export async function PATCH(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const body = await parseBody(req);
  if (!body) return fail('请求体格式错误');

  const patch: Record<string, string | null> = {};

  if (body.display_name !== undefined) {
    const name = typeof body.display_name === 'string' ? body.display_name.trim() : '';
    if (!name || name.length > 20) return fail('昵称需为 1-20 个字符');
    patch.display_name = name;
  }

  if (body.avatar_key !== undefined) {
    const key = typeof body.avatar_key === 'string' ? body.avatar_key : '';
    if (!AVATAR_KEYS.includes(key)) return fail('无效的头像');
    patch.avatar_key = key;
  }

  if (body.avatar_url !== undefined) {
    if (body.avatar_url === null) {
      patch.avatar_url = null;
    } else if (typeof body.avatar_url === 'string' && body.avatar_url.startsWith(avatarUrlPrefix())) {
      patch.avatar_url = body.avatar_url;
    } else {
      return fail('无效的头像图片');
    }
  }

  if (Object.keys(patch).length === 0) return fail('没有可更新的字段');

  const db = supabaseAdmin();
  await ensureProfile(db, user.id, user.email);

  const { data, error } = await db
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select('user_id, display_name, avatar_key, avatar_url')
    .single();
  if (error || !data) return fail(error?.message ?? '更新失败', 500);

  return ok({ profile: data });
}

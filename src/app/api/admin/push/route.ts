import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { fetchAuthorsByUserIds } from '@/lib/profiles-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const MAX_ITEMS = 20;
const MAX_NAME_LEN = 100;
const MAX_DESC_LEN = 500;

interface PushItem {
  name: string;
  media_url: string;
  description?: string | null;
}

async function findUserByEmail(
  db: ReturnType<typeof supabaseAdmin>,
  email: string,
): Promise<{ id: string; email: string | null } | null> {
  const { data, error } = await db.rpc('admin_find_user_by_email', { p_email: email });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : null;
  return row ? { id: row.id as string, email: (row.email as string | null) ?? null } : null;
}

/** GET /api/admin/push?email= — 按邮箱查找用户（需管理员） */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const email = req.nextUrl.searchParams.get('email')?.trim() ?? '';
  if (!email) return fail('请输入邮箱');

  const db = supabaseAdmin();
  const found = await findUserByEmail(db, email);
  if (!found) return fail('该邮箱未注册', 404);

  const authors = await fetchAuthorsByUserIds(db, [found.id]);
  const author = authors.get(found.id) ?? null;

  return ok({
    user_id: found.id,
    email: found.email,
    display_name: author?.display_name ?? null,
    avatar_key: author?.avatar_key ?? null,
  });
}

/**
 * POST /api/admin/push — 按邮箱推送文件/图片进用户库（需管理员）
 * body: { email, items: [{name, media_url, description?}], note? }
 * 写 user_entitlements（kind='content', source='admin'）+ 一条站内通知
 */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!email) return fail('请输入邮箱');

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (rawItems.length === 0) return fail('请至少添加一个文件');
  if (rawItems.length > MAX_ITEMS) return fail(`单次最多推送 ${MAX_ITEMS} 个文件`);

  const items: PushItem[] = [];
  for (const raw of rawItems) {
    const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
    const mediaUrl = typeof raw?.media_url === 'string' ? raw.media_url.trim() : '';
    const description = typeof raw?.description === 'string' ? raw.description.trim() : null;
    if (!name || name.length > MAX_NAME_LEN) return fail('文件名称需为 1-100 个字符');
    if (!mediaUrl) return fail('文件地址不能为空');
    if (description && description.length > MAX_DESC_LEN) return fail('说明过长');
    items.push({ name, media_url: mediaUrl, description: description || null });
  }

  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (note.length > MAX_DESC_LEN) return fail('备注过长');

  const db = supabaseAdmin();
  // 不信任前端传入的 user_id，服务端重新按邮箱解析（与订单路由「重新解析价格」同一原则）
  const user = await findUserByEmail(db, email);
  if (!user) return fail('该邮箱未注册', 404);

  const { error: insertErr } = await db.from('user_entitlements').insert(
    items.map((item) => ({
      user_id: user.id,
      user_email: user.email,
      kind: 'content',
      name: item.name,
      description: item.description ?? note ?? null,
      media_url: item.media_url,
      source: 'admin',
    })),
  );
  if (insertErr) return fail(insertErr.message, 500);

  const { error: notifyErr } = await db.from('notifications').insert({
    user_id: user.id,
    title: '你收到了新内容',
    body:
      items.length === 1
        ? `管理员为你推送了「${items[0].name}」，快去「我的库」查看`
        : `管理员为你推送了 ${items.length} 项新内容，快去「我的库」查看`,
    payload: { ref_type: 'admin_push', url: '/library' },
  });
  if (notifyErr) return fail(notifyErr.message, 500);

  return ok({ pushed: items.length });
}

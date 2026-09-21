import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { fetchAuthorsByUserIds } from '@/lib/profiles-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 单次返回的注册用户上限（前端在本地过滤搜索；超出上限的用邮箱手填兜底） */
const MAX_USERS = 500;

/**
 * GET /api/admin/users — 注册用户列表（需管理员）
 *
 * 供「推送服务」等后台功能快速选择推送对象，免去手抄邮箱：
 * - 邮箱来自 Supabase Auth（auth.admin.listUsers），按注册时间倒序
 * - 昵称 / 头像来自 profiles（迁移 017 注册触发器自动建档；老用户可能缺，回退邮箱）
 *
 * 返回：{ users: [{ user_id, email, display_name, avatar_key, avatar_url, created_at }], total, truncated }
 */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const db = supabaseAdmin();
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: MAX_USERS });
  if (error) return fail(error.message, 500);

  const users = data?.users ?? [];
  const profiles = await fetchAuthorsByUserIds(
    db,
    users.map((u) => u.id),
  );

  const rows = users
    // 无邮箱的账号（如手机号注册）无法按邮箱解析，推送选不到，直接跳过
    .filter((u) => Boolean(u.email))
    .map((u) => {
      const p = profiles.get(u.id);
      return {
        user_id: u.id,
        email: u.email as string,
        display_name: p?.display_name ?? null,
        avatar_key: p?.avatar_key ?? null,
        avatar_url: p?.avatar_url ?? null,
        created_at: u.created_at ?? null,
      };
    })
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));

  return ok({
    users: rows,
    total: data?.total ?? rows.length,
    truncated: (data?.total ?? rows.length) > rows.length,
  });
}

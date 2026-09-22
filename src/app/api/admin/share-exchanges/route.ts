import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const DEFAULT_PAGE_SIZE = 20;

/**
 * GET /api/admin/share-exchanges — 共享交换列表（管理员）
 * 查询参数：status（pending/approved/rejected/canceled，缺省全部）、page、page_size
 *
 * **通过前不返回 resource_url** —— 与用户端同一道规矩（迁移 028）。
 * 官方在这个阶段能看到的只有**参考图**与用户想要的小单元，这正是需求里
 * "官方只能看到用户的参考图"那句话。资源在 approved 之后才解锁给官方。
 */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(
      1,
      Number(url.searchParams.get('page_size') ?? DEFAULT_PAGE_SIZE) ||
        DEFAULT_PAGE_SIZE,
    ),
  );
  const status = url.searchParams.get('status') ?? '';

  const db = supabaseAdmin();
  let query = db
    .from('share_exchanges')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return fail(error.message, 500);

  const rows = (data ?? []) as Array<{
    id: string;
    user_id: string;
    user_email: string | null;
    resource_kind: 'link' | 'image';
    resource_url: string;
    resource_note: string | null;
    ref_image_url: string;
    wanted_sub_unit_id: string;
    status: 'pending' | 'approved' | 'rejected' | 'canceled';
    review_note: string | null;
    handled_at: string | null;
    created_at: string;
  }>;

  const subIds = Array.from(new Set(rows.map((r) => r.wanted_sub_unit_id)));
  const subById = new Map<string, string>();
  if (subIds.length > 0) {
    const { data: subs } = await db
      .from('sub_units')
      .select('id, name')
      .in('id', subIds);
    for (const s of subs ?? []) subById.set(s.id as string, s.name as string);
  }

  return ok({
    items: rows.map((r) => ({
      id: r.id,
      user_email: r.user_email,
      status: r.status,
      resource_kind: r.resource_kind,
      // 通过前不解锁：官方此刻只有参考图可看
      resource_url: r.status === 'approved' ? r.resource_url : null,
      resource_note: r.status === 'approved' ? r.resource_note : null,
      ref_image_url: r.ref_image_url,
      wanted_name: subById.get(r.wanted_sub_unit_id) ?? '（该单元已下架）',
      wanted_id: r.wanted_sub_unit_id,
      review_note: r.review_note,
      handled_at: r.handled_at,
      created_at: r.created_at,
    })),
    total: count ?? 0,
    page,
    page_size: pageSize,
  });
}

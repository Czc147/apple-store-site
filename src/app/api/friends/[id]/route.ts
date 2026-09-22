import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

interface Ctx {
  params: { id: string };
}

/**
 * PUT /api/friends/:id — 处理好友申请（需登录）
 * 请求体：{ action: 'accept' | 'reject' }
 *
 * 只有**被请求方**能处理。这里必须查库确认身份，不能只凭 URL 上的 id ——
 * 否则任何人猜到 id 就能替别人同意好友申请。
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const body = await parseBody(req);
  const action = body?.action;
  if (action !== 'accept' && action !== 'reject') {
    return fail('action 必须为 accept 或 reject');
  }

  const db = supabaseAdmin();
  const { data: row, error } = await db
    .from('friendships')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!row) return fail('好友申请不存在', 404);
  if (row.addressee_id !== user.id) return fail('无权处理该申请', 403);
  if (row.status !== 'pending') return fail('该申请已处理过', 409);

  const { data, error: updateErr } = await db
    .from('friendships')
    .update({
      status: action === 'accept' ? 'accepted' : 'rejected',
      responded_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single();
  if (updateErr) return fail(updateErr.message, 500);
  return ok(data);
}

/**
 * DELETE /api/friends/:id — 删除好友 / 撤回申请（需登录）
 * 双方都可以删：删好友是单方权利，不需要对方同意。
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const db = supabaseAdmin();
  const { data: row } = await db
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!row) return fail('好友关系不存在', 404);
  if (row.requester_id !== user.id && row.addressee_id !== user.id) {
    return fail('无权操作该关系', 403);
  }

  const { error } = await db.from('friendships').delete().eq('id', params.id);
  if (error) return fail(error.message, 500);
  return ok({ deleted: true });
}

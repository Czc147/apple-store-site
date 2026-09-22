import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const MAX_NOTE_LEN = 300;

interface Ctx {
  params: { id: string };
}

/**
 * PUT /api/admin/share-exchanges/:id — 处理交换（管理员）
 * 请求体：{ action: 'approve' | 'reject', note? }
 *
 * 通过时**自动把用户想要的小单元写进他的「我的内容」**（需求原文：
 * 「待官方后台确定交换后即可解锁，用户选的小单元会自动入库」）。
 * 权益形状与卡密兑换保持一致（kind='content' + target_type/target_id），
 * 这样「我的库」不用为共享单独加一套渲染 —— 对用户来说就是多了一条内容。
 *
 * 幂等：只有待处理状态能被处理，重复提交返回 409 而不是发第二份权益。
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  const action = body?.action;
  if (action !== 'approve' && action !== 'reject') {
    return fail('action 必须为 approve 或 reject');
  }
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (note.length > MAX_NOTE_LEN) return fail('说明过长');

  const db = supabaseAdmin();

  const { data: row } = await db
    .from('share_exchanges')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (!row) return fail('交换不存在', 404);
  if (row.status !== 'pending') return fail('该交换已处理过', 409);

  let entitlementId: string | null = null;

  if (action === 'approve') {
    // 小单元必须还在：已下架的话批了也派不出内容，先让管理员知道
    const { data: sub } = await db
      .from('sub_units')
      .select('id, name, redeem_image_url')
      .eq('id', row.wanted_sub_unit_id)
      .maybeSingle();
    if (!sub) {
      return fail('该小单元已不存在（可能已下架），无法派发', 409);
    }

    const { data: ent, error: entErr } = await db
      .from('user_entitlements')
      .insert({
        user_id: row.user_id,
        user_email: row.user_email,
        kind: 'content',
        // 共享没有卡密，card_key_id 留空；唯一索引对它不生效（NULL 互不相等），
        // 所以同一个小单元被换两次也不会撞约束
        card_key_id: null,
        name: sub.name,
        description: '通过「共享」交换获得',
        media_url: sub.redeem_image_url,
        target_type: 'sub_unit',
        target_id: sub.id,
        // source 的取值受迁移 005 的 check 约束限制，只能用 admin
        source: 'admin',
      })
      .select('id')
      .single();
    if (entErr) return fail(`派发权益失败：${entErr.message}`, 500);
    entitlementId = ent.id;
  }

  const { data, error } = await db
    .from('share_exchanges')
    .update({
      status: action === 'approve' ? 'approved' : 'rejected',
      review_note: note || null,
      handled_at: new Date().toISOString(),
      entitlement_id: entitlementId,
    })
    .eq('id', params.id)
    .eq('status', 'pending') // CAS：并发下只有一次能改成功
    .select()
    .single();
  if (error || !data) {
    // CAS 失败说明有人抢先处理了；此时刚插的权益要撤掉，否则用户白拿一份
    if (entitlementId) {
      await db.from('user_entitlements').delete().eq('id', entitlementId);
    }
    return fail('该交换已被处理', 409);
  }

  return ok(data);
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/**
 * DELETE /api/library/entitlements/:id — 用户删除「我的内容」里的一条权益
 *
 * 规则（用户拍板）：
 * - 只能删自己的行（校验 user_id 归属），只能删 kind='content'（「我的订阅」不给删）
 * - 【不作废卡密】：码已核销，作废会让买家手里的码变废；卡密保持 issued + 绑定本人，
 *   所以重新在兑换页输入同一码即可恢复该条目（redeem 的同码幂等重放会补写权益行）
 * - 只删权益行，不动卡密、不动通知、不动存储文件
 *
 * 响应：{ deleted: true }
 * 错误语义：401 未登录 · 403 该类型不支持删除 · 404 权益不存在（含非本人，防探测）
 */
export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const id = ctx.params.id;
  if (!id) return fail('缺少权益 id');

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('user_entitlements')
    .select('id, user_id, kind')
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(error.message, 500);

  const row = data as { id: string; user_id: string; kind: string } | null;
  // 不存在与不属于本人统一回 404：不向调用方泄露他人权益的存在性
  if (!row || row.user_id !== user.id) return fail('内容不存在', 404);
  if (row.kind !== 'content') return fail('该类型不支持删除', 403);

  const { error: delErr } = await db.from('user_entitlements').delete().eq('id', id);
  if (delErr) return fail(delErr.message, 500);

  return ok({ deleted: true });
}

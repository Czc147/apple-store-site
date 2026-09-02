import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { CARD_DELIVERY_STATUS, type CardDelivery } from '@/lib/card-types';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/**
 * POST /api/card-management/deliveries/:id/cancel — 取消取卡登记（需登录）
 * 仅「待取卡（pending）」状态可取消；已发放的订单请走卡密「重新发放」流程。
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const db = supabaseAdmin();

  const { data: delivery, error: findErr } = await db
    .from('card_deliveries')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (findErr) return fail(findErr.message, 500);
  if (!delivery) return fail('取卡登记不存在', 404);

  const status = (delivery as CardDelivery).status;
  if (status !== CARD_DELIVERY_STATUS.PENDING) {
    return fail(
      status === CARD_DELIVERY_STATUS.FULFILLED
        ? '已发放的登记不能取消；如需收回卡密请对相应卡密执行「重新发放」'
        : '该登记已取消',
      409,
    );
  }

  const { data: updated, error: updateErr } = await db
    .from('card_deliveries')
    .update({ status: CARD_DELIVERY_STATUS.CANCELLED })
    .eq('id', params.id)
    // 乐观并发保护：仅当仍为待取卡状态时才取消
    .eq('status', CARD_DELIVERY_STATUS.PENDING)
    .select()
    .maybeSingle();
  if (updateErr) return fail(updateErr.message, 500);
  if (!updated) return fail('登记状态已变化，请刷新后重试', 409);

  return ok(updated);
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import {
  CARD_KEY_ACTIONS,
  type CardKeyAction,
  type CardKeyStatus,
} from '@/lib/card-types';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/**
 * 状态机规则：
 * - void（作废）：未使用 / 已发放 → 已作废（坏卡场景；保留订单关联便于追溯）
 * - restore（恢复）：已作废 → 未使用（清空订单关联）
 * - reissue（重新发放）：已发放 → 未使用（售后补发，卡回池子；清空订单关联）
 */
const TRANSITIONS: Record<
  CardKeyAction,
  {
    from: CardKeyStatus[];
    to: CardKeyStatus;
    /** 是否清空 order_id / issued_at */
    clearOrder: boolean;
    deniedMsg: string;
  }
> = {
  void: {
    from: ['unused', 'issued'],
    to: 'void',
    clearOrder: false,
    deniedMsg: '仅「未使用」或「已发放」的卡密可作废',
  },
  restore: {
    from: ['void'],
    to: 'unused',
    clearOrder: true,
    deniedMsg: '仅「已作废」的卡密可恢复',
  },
  reissue: {
    from: ['issued'],
    to: 'unused',
    clearOrder: true,
    deniedMsg: '仅「已发放」的卡密可重新发放（售后补发）',
  },
};

/**
 * PUT /api/card-management/keys/:id/status — 卡密状态变更（需登录）
 * 请求体：{ action: 'void' | 'restore' | 'reissue' }
 * 成功返回更新后的完整记录；状态不允许时 409；卡密不存在 404。
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  const action = typeof body?.action === 'string' ? body.action.trim() : '';
  if (!CARD_KEY_ACTIONS.includes(action as CardKeyAction)) {
    return fail(`action 必须为 ${CARD_KEY_ACTIONS.join(' / ')} 之一`);
  }
  const rule = TRANSITIONS[action as CardKeyAction];

  const db = supabaseAdmin();

  const { data: key, error: findErr } = await db
    .from('card_keys')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (findErr) return fail(findErr.message, 500);
  if (!key) return fail('卡密不存在', 404);

  // 状态机校验：当前状态必须在允许的源状态内
  if (!rule.from.includes(key.status as CardKeyStatus)) {
    return fail(rule.deniedMsg, 409);
  }

  const patch: Record<string, unknown> = { status: rule.to };
  if (rule.clearOrder) {
    patch.order_id = null;
    patch.issued_at = null;
  }

  const { data: updated, error: updateErr } = await db
    .from('card_keys')
    .update(patch)
    .eq('id', params.id)
    // 乐观并发保护：仅当状态仍为校验时的值才生效（防两个管理员同时操作）
    .in('status', rule.from)
    .select()
    .maybeSingle();
  if (updateErr) return fail(updateErr.message, 500);
  if (!updated) return fail(rule.deniedMsg, 409);

  return ok(updated);
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import type { CardKey } from '@/lib/card-types';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 输入长度上限（防超长恶意输入） */
const ORDER_ID_MAX = 100;
const CLAIM_TOKEN_MAX = 200;

/**
 * 映射 deliver_card_keys RPC 的异常到对外响应。
 * 安全约定：「不存在 / 取卡码错误 / 已取消」统一返回同一条 403 文案，
 * 避免攻击者通过差异化报错拿订单号枚举探测；真实原因仅写入服务端日志。
 */
function mapRpcError(message: string) {
  if (
    message.includes('DELIVERY_NOT_FOUND') ||
    message.includes('TOKEN_MISMATCH') ||
    message.includes('DELIVERY_CANCELLED')
  ) {
    return fail('订单号或取卡码不正确', 403);
  }
  if (message.includes('INSUFFICIENT_STOCK') || message.includes('PRODUCT_DISABLED')) {
    return fail('卡密暂不可用，请联系客服', 409);
  }
  if (message.includes('KEYS_REISSUED')) {
    return fail('该订单卡密已售后调整，请联系客服', 409);
  }
  return null;
}

/**
 * POST /api/card-management/deliver — 前台取卡（面向买家，无需管理员登录）
 *
 * 身份验证：订单号 + 取卡码双因子。
 *   取卡码在后台「取卡登记」时由服务端生成并发给买家，
 *   只知道订单号无法取走卡密（防枚举）。
 *
 * 行为：
 * - 首次请求：数据库事务内原子发放（FIFO 取未使用卡密 → 置为已发放），
 *   登记单置为已发放；库存不足整体回滚，登记单保持待取卡。
 * - 重复请求（幂等）：已发放的订单返回同一批卡密，不再消耗库存。
 *
 * 请求体：{ order_id, claim_token }
 * 成功 200：{ order_id, quantity, keys: string[], product_description, delivered_at }
 *
 * ⚠️ 响应包含卡密明文：任何日志 / 错误上报不得转发本响应体。
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  const orderId = typeof body?.order_id === 'string' ? body.order_id.trim() : '';
  const claimToken = typeof body?.claim_token === 'string' ? body.claim_token.trim() : '';

  if (!orderId || !claimToken) return fail('请提供订单号与取卡码');
  if (orderId.length > ORDER_ID_MAX || claimToken.length > CLAIM_TOKEN_MAX) {
    // 超长输入同样不泄露细节
    return fail('订单号或取卡码不正确', 403);
  }

  // 在数据库事务内完成：锁定登记单 → 校验取卡码 → 幂等返回 / 原子发放
  const { data, error } = await supabaseAdmin().rpc('deliver_card_keys', {
    p_order_id: orderId,
    p_claim_token: claimToken,
  });

  if (error) {
    // 服务端留存真实原因便于排查（不含任何卡密内容）
    console.warn('[card-deliver] 取卡失败:', error.message, 'order_id =', orderId);
    const mapped = mapRpcError(error.message ?? '');
    return mapped ?? fail('取卡失败，请稍后重试', 500);
  }

  const rows = (data ?? []) as CardKey[];
  // 兜底：正常流程 RPC 要么返回卡密要么抛异常，此分支理论上不可达
  if (rows.length === 0) {
    return fail('订单号或取卡码不正确', 403);
  }

  // 附带商品描述（买家取卡页展示用）
  let productDescription: string | null = null;
  const { data: product } = await supabaseAdmin()
    .from('card_products')
    .select('description')
    .eq('id', rows[0].card_product_id)
    .maybeSingle();
  productDescription = ((product as { description: string | null } | null)?.description) ?? null;

  return ok({
    order_id: orderId,
    quantity: rows.length,
    keys: rows.map((r) => r.content),
    product_description: productDescription,
    delivered_at: rows[0].issued_at,
  });
}

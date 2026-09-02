import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { CARD_KEY_STATUS } from '@/lib/card-types';
import { resolveTargetContent } from '@/lib/card-targets';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 兑换码长度上限（与卡密导入的 MAX_KEY_LENGTH 保持一致） */
const MAX_CODE_LENGTH = 500;

/**
 * 无效码统一文案：不存在 / 仅作废 都返回同一句，
 * 避免攻击者通过响应差异枚举有效卡密；真实原因只写服务端日志。
 */
const INVALID_CODE_MSG = '兑换码不正确，请核对后再试';

/** 商品未关联目标或目标未配置兑换商品时的统一提示 */
const NO_CONTENT_MSG = '该商品暂未配置兑换内容，请联系客服';

/**
 * POST /api/redeem — 卡密兑换（公开接口，无需登录）
 *
 * 买家在第三方发卡平台付款后拿到卡密，到本站「兑换」页输入：
 * 校验通过即核销（unused → issued）并返回商品后台存入的兑换商品（图片 / 视频 / 文档）。
 *
 * 请求体：{ code }
 * 响应 200：{ product_name, product_description, image_url, redeemed_now }
 * - redeemed_now=true  本次核销
 * - redeemed_now=false 该码此前已发放过（买家可重复输入查看图片）
 *
 * 错误语义：
 * - 400  空码 / 超长
 * - 403  码不存在或仅作废（统一文案，防枚举）
 * - 409  商品未关联目标 / 目标未配置兑换商品（此时不核销，卡密保持原状态）
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!code) return fail('请输入兑换码');
  if (code.length > MAX_CODE_LENGTH) return fail(`兑换码长度不能超过 ${MAX_CODE_LENGTH}`);

  const db = supabaseAdmin();

  // 按内容精确匹配（同一内容理论上只有一行；兼容历史重复导入，按创建时间排序取首条）
  const { data: keys, error: keysErr } = await db
    .from('card_keys')
    .select('id, card_product_id, status')
    .eq('content', code)
    .order('created_at', { ascending: true });
  if (keysErr) return fail(keysErr.message, 500);

  const rows = (keys ?? []) as Array<{ id: string; card_product_id: string; status: string }>;
  if (rows.length === 0) {
    console.warn('[redeem] 兑换码不存在:', `${code.slice(0, 8)}…`);
    return fail(INVALID_CODE_MSG, 403);
  }

  // 优先取 unused（待核销），其次 issued（已发放，允许重复查看）；仅 void → 按无效码处理
  const target =
    rows.find((r) => r.status === CARD_KEY_STATUS.UNUSED) ??
    rows.find((r) => r.status === CARD_KEY_STATUS.ISSUED);
  if (!target) {
    console.warn('[redeem] 兑换码已作废, key id:', rows.map((r) => r.id).join(', '));
    return fail(INVALID_CODE_MSG, 403);
  }

  // 先解析兑换内容、再核销：商品无关联目标或目标没配图片时不能烧掉卡密
  const { data: product, error: productErr } = await db
    .from('card_products')
    .select('id, description, target_type, target_id')
    .eq('id', target.card_product_id)
    .maybeSingle();
  if (productErr) return fail(productErr.message, 500);

  if (!product || !product.target_type || !product.target_id) {
    console.warn('[redeem] 商品未关联目标, product id:', target.card_product_id);
    return fail(NO_CONTENT_MSG, 409);
  }

  const content = await resolveTargetContent(product.target_type, product.target_id);
  if (!content || !content.redeem_image_url) {
    console.warn('[redeem] 目标未配置兑换商品, target:', product.target_type, product.target_id);
    return fail(NO_CONTENT_MSG, 409);
  }

  // 核销：仅 unused 时执行；CAS（附带 status='unused' 条件）防止并发双重核销
  let redeemedNow = false;
  if (target.status === CARD_KEY_STATUS.UNUSED) {
    const { data: updated, error: consumeErr } = await db
      .from('card_keys')
      .update({ status: CARD_KEY_STATUS.ISSUED, issued_at: new Date().toISOString() })
      .eq('id', target.id)
      .eq('status', CARD_KEY_STATUS.UNUSED)
      .select('id');
    if (consumeErr) return fail(consumeErr.message, 500);

    if ((updated ?? []).length > 0) {
      redeemedNow = true;
    } else {
      // 0 行 = 并发被抢先：重读状态——已发放则幂等返回内容，被作废则按无效码
      const { data: reread, error: rereadErr } = await db
        .from('card_keys')
        .select('status')
        .eq('id', target.id)
        .maybeSingle();
      if (rereadErr) return fail(rereadErr.message, 500);
      if ((reread as { status: string } | null)?.status !== CARD_KEY_STATUS.ISSUED) {
        return fail(INVALID_CODE_MSG, 403);
      }
    }
  }

  return ok({
    product_name: content.name,
    product_description: (product.description as string | null) ?? null,
    image_url: content.redeem_image_url,
    redeemed_now: redeemedNow,
  });
}

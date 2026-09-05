import type { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import {
  CARD_KEY_STATUS,
  REDEEM_TYPE,
  type CardTargetType,
  type RedeemType,
} from '@/lib/card-types';
import { resolveTargetContent } from '@/lib/card-targets';
import { getRequestUser, type AuthUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

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

/** 数据库行类型（卡密商品 + 兑换类型扩展列，迁移 005） */
interface ProductRow {
  id: string;
  description: string | null;
  target_type: 'sub_unit' | 'activity' | 'subscription' | null;
  target_id: string | null;
  redeem_type: RedeemType | null;
  unlock_duration_days: number | null;
}

interface KeyRow {
  id: string;
  card_product_id: string;
  status: string;
}

/** 核销 CAS 结果 */
type ConsumeResult =
  | { ok: true; redeemedNow: boolean }
  | { ok: false; status: number; message: string };

/**
 * 核销（unused → issued）CAS：仅当 wasUnused 为 true 时尝试更新，
 * 附带 status='unused' 条件防并发双重核销；被抢先后重读状态做幂等判断。
 */
async function consumeIfUnused(
  db: ReturnType<typeof supabaseAdmin>,
  keyId: string,
  wasUnused: boolean,
): Promise<ConsumeResult> {
  if (!wasUnused) return { ok: true, redeemedNow: false };

  const { data: updated, error } = await db
    .from('card_keys')
    .update({ status: CARD_KEY_STATUS.ISSUED, issued_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('status', CARD_KEY_STATUS.UNUSED)
    .select('id');
  if (error) return { ok: false, status: 500, message: error.message };
  if ((updated ?? []).length > 0) return { ok: true, redeemedNow: true };

  // 0 行 = 并发被抢先：重读状态——已发放则幂等继续，被作废则按无效码
  const { data: reread, error: rereadErr } = await db
    .from('card_keys')
    .select('status')
    .eq('id', keyId)
    .maybeSingle();
  if (rereadErr) return { ok: false, status: 500, message: rereadErr.message };
  if ((reread as { status: string } | null)?.status !== CARD_KEY_STATUS.ISSUED) {
    return { ok: false, status: 403, message: INVALID_CODE_MSG };
  }
  return { ok: true, redeemedNow: false };
}

/**
 * CAS 绑定账号：仅当 bound_user_id 为 null 时写入 userId。
 * 返回 fresh=本次是否新绑定（已被他人绑定 / 已是本人时 false）。
 */
async function bindKeyToUser(
  db: ReturnType<typeof supabaseAdmin>,
  keyId: string,
  userId: string,
): Promise<{ fresh: boolean; error?: string }> {
  const { data, error } = await db
    .from('card_keys')
    .update({ bound_user_id: userId })
    .eq('id', keyId)
    .is('bound_user_id', null)
    .select('id');
  if (error) return { fresh: false, error: error.message };
  return { fresh: (data ?? []).length > 0 };
}

/**
 * POST /api/redeem — 卡密兑换（公开接口，无需登录）
 *
 * 买家在第三方发卡平台付款后拿到卡密，到本站「兑换」页输入。
 * 按商品兑换类型分流（迁移 005）：
 * - content（默认）：核销后返回兑换商品（图片 / 视频 / 文档）
 * - unlock_daily：核销后解锁「每日计划」，返回有效期（后台设定的天数，自核销起算）
 *
 * 若请求带 Bearer（已登录）：顺带 CAS 绑定账号并写入「我的库」权益；
 * 游客兑换不落权益（本地库保存码，登录后经 /api/library/sync 补绑）。
 *
 * 响应：
 * - content：{ result_type:'content', product_name, product_description, image_url, redeemed_now, bound }
 * - unlock_daily：{ result_type:'unlock', product_name, permanent, expires_at, redeemed_now, bound }
 *
 * 错误语义：400 空码/超长 · 403 无效码（防枚举）· 409 未配置兑换内容 · 429 限速
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  // 限速：把码当凭证后爆破收益面变大（尽力而为，见 lib/rate-limit.ts）
  if (!rateLimit('redeem', getClientIp(req))) return fail('操作过于频繁，请稍后再试', 429);

  const body = await parseBody(req);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!code) return fail('请输入兑换码');
  if (code.length > MAX_CODE_LENGTH) return fail(`兑换码长度不能超过 ${MAX_CODE_LENGTH}`);

  const db = supabaseAdmin();

  // 按内容精确匹配（同一内容理论上只有一行；兼容历史重复导入，按创建时间取首条）
  const { data: keys, error: keysErr } = await db
    .from('card_keys')
    .select('id, card_product_id, status')
    .eq('content', code)
    .order('created_at', { ascending: true });
  if (keysErr) return fail(keysErr.message, 500);

  const rows = (keys ?? []) as KeyRow[];
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

  // 先读商品再核销：商品无关联目标时不能烧掉卡密（含兑换类型/有效天数，迁移 005）
  const { data: product, error: productErr } = await db
    .from('card_products')
    .select('id, description, target_type, target_id, redeem_type, unlock_duration_days')
    .eq('id', target.card_product_id)
    .maybeSingle();
  if (productErr) return fail(productErr.message, 500);

  const prod = product as ProductRow | null;
  if (!prod || !prod.target_type || !prod.target_id) {
    console.warn('[redeem] 商品未关联目标, product id:', target.card_product_id);
    return fail(NO_CONTENT_MSG, 409);
  }
  // 经过上方守卫后 target_type / target_id 已收窄为非空
  const targetType: CardTargetType = prod.target_type;
  const targetId: string = prod.target_id;

  // 登录用户（可选）：带 Bearer 时顺带绑定账号 + 写「我的库」权益
  const user = await getRequestUser(req);

  if ((prod.redeem_type ?? REDEEM_TYPE.CONTENT) === REDEEM_TYPE.UNLOCK_DAILY) {
    return handleUnlockDaily(db, prod, targetType, targetId, target, user);
  }
  return handleContent(db, prod, targetType, targetId, target, user);
}

/** unlock_daily 分支：核销 → 解锁每日计划；登录用户顺带绑定 + 原子写权益（叠加延期） */
async function handleUnlockDaily(
  db: ReturnType<typeof supabaseAdmin>,
  product: ProductRow,
  targetType: CardTargetType,
  targetId: string,
  target: KeyRow,
  user: AuthUser | null,
): Promise<NextResponse> {
  const durationDays =
    typeof product.unlock_duration_days === 'number' ? product.unlock_duration_days : null;

  // 展示名取关联订阅名；解锁类无需兑换图，忽略 image_url
  let productName = (product.description as string | null) ?? '每日计划';
  try {
    const resolved = await resolveTargetContent(targetType, targetId);
    if (resolved?.name) productName = resolved.name;
  } catch {
    /* 目标解析失败不阻断兑换，回退商品描述 */
  }

  const consume = await consumeIfUnused(db, target.id, target.status === CARD_KEY_STATUS.UNUSED);
  if (!consume.ok) return fail(consume.message, consume.status);

  // 游客回显的到期估算（权威以服务端 /api/daily-access 现算为准）
  let expiresAt: string | null =
    durationDays === null ? null : new Date(Date.now() + durationDays * 86400000).toISOString();

  if (user) {
    const bind = await bindKeyToUser(db, target.id, user.id);
    if (bind.error) return fail(bind.error, 500);
    if (bind.fresh) {
      // 原子写权益：无则插入，有则叠加延期（grant_daily_plan RPC）
      const { data: ent, error: entErr } = await db.rpc('grant_daily_plan', {
        p_user_id: user.id,
        p_user_email: user.email,
        p_card_key_id: target.id,
        p_duration_days: durationDays,
      });
      if (entErr) return fail(entErr.message, 500);
      const row = ent as { expires_at: string | null } | null;
      if (row) expiresAt = row.expires_at; // 叠加延期后为真实到期时间
    } else {
      // 已绑定（本人此前已兑换/同步）：读现有权益回显真实到期状态
      const { data: existing, error: exErr } = await db
        .from('user_entitlements')
        .select('expires_at')
        .eq('user_id', user.id)
        .eq('kind', 'daily_plan')
        .maybeSingle();
      if (!exErr && existing) {
        expiresAt = (existing as { expires_at: string | null }).expires_at;
      }
    }
  }

  return ok({
    result_type: 'unlock',
    product_name: productName,
    permanent: expiresAt === null,
    expires_at: expiresAt,
    redeemed_now: consume.redeemedNow,
    bound: Boolean(user),
  });
}

/** content 分支：核销 → 返回兑换内容；登录用户顺带绑定 + 写 content 权益（幂等） */
async function handleContent(
  db: ReturnType<typeof supabaseAdmin>,
  product: ProductRow,
  targetType: CardTargetType,
  targetId: string,
  target: KeyRow,
  user: AuthUser | null,
): Promise<NextResponse> {
  const content = await resolveTargetContent(targetType, targetId);
  if (!content || !content.redeem_image_url) {
    console.warn('[redeem] 目标未配置兑换商品, target:', targetType, targetId);
    return fail(NO_CONTENT_MSG, 409);
  }

  const consume = await consumeIfUnused(db, target.id, target.status === CARD_KEY_STATUS.UNUSED);
  if (!consume.ok) return fail(consume.message, consume.status);

  if (user) {
    const bind = await bindKeyToUser(db, target.id, user.id);
    if (bind.error) return fail(bind.error, 500);
    if (bind.fresh) {
      const { error: entErr } = await db.from('user_entitlements').insert({
        user_id: user.id,
        user_email: user.email,
        kind: 'content',
        card_key_id: target.id,
        name: content.name,
        description: product.description,
        media_url: content.redeem_image_url,
        target_type: targetType,
        target_id: targetId,
        source: 'redeem',
      });
      // 23505 = 同用户同码已有权益（并发/重复）→ 幂等忽略
      if (entErr && entErr.code !== '23505') return fail(entErr.message, 500);
    }
  }

  return ok({
    result_type: 'content',
    product_name: content.name,
    product_description: product.description,
    image_url: content.redeem_image_url,
    redeemed_now: consume.redeemedNow,
    bound: Boolean(user),
  });
}

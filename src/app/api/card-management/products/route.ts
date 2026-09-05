import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody, toSortOrder, toNullableText } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import {
  TARGET_TYPE_VALUES,
  REDEEM_TYPE_VALUES,
  type CardTargetType,
  type CardProduct,
  type RedeemType,
} from '@/lib/card-types';
import { parseRedeemType, parseUnlockDurationDays } from '@/lib/card-redeem-fields';
import { resolveTargetNames, targetExists } from '@/lib/card-targets';
import { aggregateKeyStats, EMPTY_KEY_STATS } from '@/lib/card-stats';
import { PUT as putById, DELETE as deleteById } from './[id]/route';

// API 一律动态执行，避免构建时预取数据库
export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/**
 * GET /api/card-management/products — 卡密商品列表（sort_order 升序）
 * 可选参数：
 * - enabled=true/false  按启用/禁用过滤
 * - include_stats=1     为每个商品附加库存统计 stats {total, unused, issued, void}
 * 每条附加 target_name / group_name（关联目标已删除时为 null）
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const enabledParam = req.nextUrl.searchParams.get('enabled');
  const includeStats = req.nextUrl.searchParams.get('include_stats') === '1';

  try {
    let query = supabaseAdmin()
      .from('card_products')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (enabledParam === 'true' || enabledParam === 'false') {
      query = query.eq('enabled', enabledParam === 'true');
    }
    const { data, error } = await query;
    if (error) return fail(error.message, 500);

    const products = (data ?? []) as CardProduct[];
    const names = await resolveTargetNames(products);
    const named = products.map((p) => ({
      ...p,
      target_name: names.get(p.id)?.target_name ?? null,
      group_name: names.get(p.id)?.group_name ?? null,
    }));
    if (!includeStats) return ok(named);

    // 分块聚合（PostgREST 单请求上限 1000 行，见 lib/card-stats.ts）
    const { byProduct } = await aggregateKeyStats();
    return ok(named.map((p) => ({ ...p, stats: byProduct[p.id] ?? { ...EMPTY_KEY_STATS } })));
  } catch (e) {
    return fail(e instanceof Error ? e.message : '查询失败', 500);
  }
}

/**
 * POST /api/card-management/products — 新建卡密商品（需登录）
 * body: { target_type*（sub_unit/activity/subscription）, target_id*（uuid）,
 *         description?, redeem_type?, unlock_duration_days?, enabled?, sort_order? }
 * - redeem_type：content（默认）/ unlock_daily
 * - unlock_duration_days：仅 unlock_daily 生效，正整数天数，缺省=永久
 * 约束：一个目标至多关联一个卡密商品，重复关联返回 409
 */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  const targetType = typeof body?.target_type === 'string' ? body.target_type.trim() : '';
  const targetId = typeof body?.target_id === 'string' ? body.target_id.trim() : '';
  if (!TARGET_TYPE_VALUES.includes(targetType as CardTargetType)) {
    return fail('target_type 必须为 sub_unit / activity / subscription');
  }
  if (!targetId) return fail('target_id 为必填字段');

  const type = targetType as CardTargetType;
  const typeLabel =
    type === 'sub_unit' ? '小单元' : type === 'activity' ? '活动' : '订阅';

  // 兑换类型 / 有效天数（迁移 005）：类型缺省 content；有效天数仅 unlock_daily 生效
  const rt = parseRedeemType(body?.redeem_type);
  if (!rt.ok) return fail(rt.error);
  const redeemType = rt.value ?? 'content';
  const dur = parseUnlockDurationDays(body?.unlock_duration_days);
  if (!dur.ok) return fail(dur.error);
  const unlockDays = redeemType === 'unlock_daily' ? dur.value : null;

  const db = supabaseAdmin();
  try {
    // 关联目标必须存在（多态关联无外键，需显式校验）
    if (!(await targetExists(type, targetId))) {
      return fail(`关联的${typeLabel}不存在`);
    }

    // 1:1 约束的友好提示（数据库唯一索引兜底）
    const { data: linked, error: linkedErr } = await db
      .from('card_products')
      .select('id')
      .eq('target_type', type)
      .eq('target_id', targetId)
      .maybeSingle();
    if (linkedErr) return fail(linkedErr.message, 500);
    if (linked) return fail(`该${typeLabel}已关联卡密商品`, 409);

    const { data, error } = await db
      .from('card_products')
      .insert({
        target_type: type,
        target_id: targetId,
        description: toNullableText(body?.description),
        redeem_type: redeemType,
        unlock_duration_days: unlockDays,
        enabled: typeof body?.enabled === 'boolean' ? body.enabled : true,
        sort_order: toSortOrder(body?.sort_order),
      })
      .select()
      .single();
    if (error) {
      // 并发下唯一索引冲突兜底
      if (error.code === '23505') return fail(`该${typeLabel}已关联卡密商品`, 409);
      return fail(error.message, 500);
    }
    return ok(data, 201);
  } catch (e) {
    return fail(e instanceof Error ? e.message : '创建失败', 500);
  }
}

/** PUT /api/card-management/products — 更新（请求体携带 id，等价于 PUT /:id） */
export async function PUT(req: NextRequest) {
  const peek = await parseBody(req.clone());
  const id = typeof peek?.id === 'string' && peek.id ? peek.id : null;
  if (!id) return fail('缺少 id 字段（或使用 PUT /api/card-management/products/:id）');
  return putById(req, { params: { id } });
}

/** DELETE /api/card-management/products?id=xxx — 删除（id 走 query 或请求体） */
export async function DELETE(req: NextRequest) {
  let id = req.nextUrl.searchParams.get('id');
  if (!id) {
    const peek = await parseBody(req.clone());
    id = typeof peek?.id === 'string' && peek.id ? peek.id : null;
  }
  if (!id) return fail('缺少 id（query 参数或请求体 id 字段）');
  return deleteById(req, { params: { id } });
}

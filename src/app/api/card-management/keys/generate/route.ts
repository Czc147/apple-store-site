import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { TARGET_TYPE, type CardTargetType } from '@/lib/card-types';
import { activityName } from '@/lib/card-targets';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 单批总量上限（与卡密导入对齐：大单元 × 每个小单元数量 之和） */
const MAX_TOTAL = 5000;
/** 单个对象一次的生成上限 */
const MAX_PER_TARGET = 5000;
/** 随机位位数范围 */
const MIN_LENGTH = 4;
const MAX_LENGTH = 64;
/** 前缀长度上限 */
const MAX_PREFIX_LEN = 32;
/** 卡密总长上限（与导入的 MAX_KEY_LENGTH 一致） */
const MAX_KEY_LENGTH = 500;
/** 与库内已有卡密冲突时的重试轮数（空间极小时可能补不满，如实报告缺口） */
const MAX_ATTEMPTS = 5;
/** 单个码的随机位尝试上限（内存去重撞满时提前放弃，防死循环） */
const MAX_KEY_TRIES = 200;

/** 可选字符集（勾选组合） */
const CHARSET = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
} as const;

/** 易混字符：0/O、1/l/I（勾选「排除易混」时从字符集剔除） */
const CONFUSING = new Set(['0', 'O', '1', 'l', 'I']);

/** 生成对象：大单元是「批量快捷入口」而非兑换粒度，展开为其下每个小单元各生成一批 */
type GenerateTargetType = 'major_unit' | CardTargetType;

const GENERATE_TYPES: string[] = [
  'major_unit',
  TARGET_TYPE.SUB_UNIT,
  TARGET_TYPE.ACTIVITY,
  TARGET_TYPE.SUBSCRIPTION,
];

/** 解析出的一批目标（每个目标 = 一个卡密商品 = 一批码） */
interface Target {
  target_type: CardTargetType;
  target_id: string;
  target_name: string;
  /** 分组名（大单元展开的小单元带上大单元名，其余为 null） */
  group_name: string | null;
  /** 订阅目标的类型（daily_plan 决定卡密商品的兑换类型），其余为 null */
  sub_type: string | null;
}

/** 生成字符集：勾选组合 → 至少一种；可排除易混字符 */
function buildAlphabet(body: Record<string, unknown> | null): { alphabet: string } | { error: string } {
  const parts: string[] = [];
  if (body?.upper === true) parts.push(CHARSET.upper);
  if (body?.lower === true) parts.push(CHARSET.lower);
  if (body?.digits === true) parts.push(CHARSET.digits);
  if (parts.length === 0) return { error: '请至少选择一种字符（大写 / 小写 / 数字）' };

  let alphabet = parts.join('');
  if (body?.exclude_confusing === true) {
    alphabet = [...alphabet].filter((ch) => !CONFUSING.has(ch)).join('');
  }
  if (!alphabet) return { error: '排除易混字符后字符集为空，请调整选项' };
  return { alphabet };
}

/**
 * 生成一个随机码（前缀 + 随机位）。
 * 用 randomBytes 拒绝采样替代取模，消除字符分布偏差；
 * 撞上批内已用码时重试，尝试次数用尽返回 null（空间不足，由调用方记缺口）。
 */
function randomKey(
  alphabet: string,
  length: number,
  prefix: string,
  taken: Set<string>,
): string | null {
  const n = alphabet.length;
  // 丢弃 ≥ limit 的字节，保证 0..n-1 均匀（取模偏差消除）
  const limit = 256 - (256 % n);

  for (let tries = 0; tries < MAX_KEY_TRIES; tries++) {
    let body = '';
    while (body.length < length) {
      const buf = randomBytes(length - body.length + 8);
      for (const byte of buf) {
        if (byte < limit) {
          body += alphabet[byte % n];
          if (body.length === length) break;
        }
      }
    }
    const key = prefix + body;
    if (!taken.has(key)) {
      taken.add(key);
      return key;
    }
  }
  return null;
}

/** 解析目标列表（服务端展开大单元，不信任前端传入的子单元清单） */
async function resolveTargets(
  db: ReturnType<typeof supabaseAdmin>,
  type: GenerateTargetType,
  id: string,
): Promise<Target[] | { error: string }> {
  if (type === 'major_unit') {
    const { data: major, error: majorErr } = await db
      .from('major_units')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();
    if (majorErr) return { error: majorErr.message };
    if (!major) return { error: '大单元不存在' };

    const { data: units, error: unitsErr } = await db
      .from('sub_units')
      .select('id, name')
      .eq('major_unit_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (unitsErr) return { error: unitsErr.message };
    const list = (units ?? []) as Array<{ id: string; name: string }>;
    if (list.length === 0) {
      return { error: `大单元「${(major as { name: string }).name}」下还没有小单元` };
    }
    const groupName = (major as { name: string }).name;
    return list.map((u) => ({
      target_type: TARGET_TYPE.SUB_UNIT,
      target_id: u.id,
      target_name: u.name,
      group_name: groupName,
      sub_type: null,
    }));
  }

  if (type === TARGET_TYPE.ACTIVITY) {
    const { data: act, error } = await db
      .from('activities')
      .select('id, title, description')
      .eq('id', id)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!act) return { error: '活动不存在' };
    const row = act as { id: string; title: string | null; description: string | null };
    return [
      {
        target_type: TARGET_TYPE.ACTIVITY,
        target_id: row.id,
        target_name: activityName(row.title, row.description),
        group_name: null,
        sub_type: null,
      },
    ];
  }

  const { data: sub, error } = await db
    .from('subscriptions')
    .select('id, name, type')
    .eq('id', id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!sub) return { error: '订阅不存在' };
  const row = sub as { id: string; name: string; type: string | null };
  return [
    {
      target_type: TARGET_TYPE.SUBSCRIPTION,
      target_id: row.id,
      target_name: row.name,
      group_name: null,
      sub_type: row.type,
    },
  ];
}

/** 取目标已有的卡密商品；没有则自动创建（每目标至多一个商品：唯一索引兜底） */
async function ensureProduct(
  db: ReturnType<typeof supabaseAdmin>,
  target: Target,
): Promise<{ id: string; created: boolean } | { error: string }> {
  const find = () =>
    db
      .from('card_products')
      .select('id')
      .eq('target_type', target.target_type)
      .eq('target_id', target.target_id)
      .maybeSingle();

  const { data: existing, error: findErr } = await find();
  if (findErr) return { error: findErr.message };
  if (existing) return { id: (existing as { id: string }).id, created: false };

  const { data: created, error: createErr } = await db
    .from('card_products')
    .insert({
      target_type: target.target_type,
      target_id: target.target_id,
      // 兑换类型与后台表单口径一致：daily_plan 订阅 → 解锁每日计划，其余 → 兑换内容
      redeem_type:
        target.target_type === TARGET_TYPE.SUBSCRIPTION && target.sub_type === 'daily_plan'
          ? 'unlock_daily'
          : 'content',
      // 订阅目标的天数由「订阅管理」配置（卡密商品列恒 null，与 CardProductForm 一致）
      unlock_duration_days: null,
      enabled: true,
      sort_order: 0,
    })
    .select('id')
    .single();
  if (createErr) {
    // 并发下已被别处创建：重读一次
    if ((createErr as { code?: string }).code === '23505') {
      const { data: again } = await find();
      if (again) return { id: (again as { id: string }).id, created: false };
    }
    return { error: createErr.message };
  }
  return { id: (created as { id: string }).id, created: true };
}

/** 为某商品生成并入库 n 个码（upsert 忽略已有重复；冲突则补量，缺口如实返回） */
async function generateForProduct(
  db: ReturnType<typeof supabaseAdmin>,
  productId: string,
  quantity: number,
  alphabet: string,
  length: number,
  prefix: string,
  taken: Set<string>,
): Promise<{ keys: string[]; shortfall: number }> {
  const inserted: string[] = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS && inserted.length < quantity; attempt++) {
    const need = quantity - inserted.length;
    const candidates: string[] = [];
    let exhausted = false;
    for (let i = 0; i < need; i++) {
      const key = randomKey(alphabet, length, prefix, taken);
      if (!key) {
        exhausted = true; // 批内空间耗尽
        break;
      }
      candidates.push(key);
    }
    if (candidates.length === 0) break;

    const { data, error } = await db
      .from('card_keys')
      .upsert(
        candidates.map((content) => ({ card_product_id: productId, content })),
        { onConflict: 'card_product_id,content', ignoreDuplicates: true },
      )
      .select('content');
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ content: string }>) {
      inserted.push(row.content);
    }
    if (exhausted) break;
  }

  return { keys: inserted, shortfall: quantity - inserted.length };
}

/**
 * POST /api/card-management/keys/generate — 一键生成卡密（需管理员）
 *
 * 请求体：
 * {
 *   target_type: 'major_unit' | 'sub_unit' | 'activity' | 'subscription',
 *   target_id: string,
 *   quantity: number,            // 每个目标各生成多少张（大单元 = 每个小单元各这么多）
 *   length: number,              // 随机位位数 4–64
 *   upper?: boolean, lower?: boolean, digits?: boolean,   // 字符集（至少选一）
 *   exclude_confusing?: boolean, // 排除易混字符 0/O/1/l/I
 *   prefix?: string              // 可选前缀，如「VIP-」
 * }
 *
 * 语义（用户拍板）：
 * - 大单元不是兑换粒度，只是批量入口：展开为其下每个小单元，各自生成一批独立卡密
 * - 活动 / 订阅：直接给自身对应的卡密商品生成
 * - 目标没有卡密商品时自动创建（大单元展开出的每个小单元各自建）
 *
 * 去重兜底：数据库唯一约束 (card_product_id, content) + upsert 忽略重复；
 * 撞库时自动补量（最多 MAX_ATTEMPTS 轮），仍缺则返回 shortfall。
 *
 * 响应 201：{ total_requested, total_imported, total_shortfall, created_products, targets: [...] }
 */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = (await parseBody(req)) as Record<string, unknown> | null;

  const rawType = typeof body?.target_type === 'string' ? body.target_type : '';
  if (!GENERATE_TYPES.includes(rawType)) {
    return fail('target_type 必须是 major_unit / sub_unit / activity / subscription');
  }
  const generateType = rawType as GenerateTargetType;

  const targetId = typeof body?.target_id === 'string' ? body.target_id.trim() : '';
  if (!targetId) return fail('请选择要生成卡密的对象');

  const quantity = Number(body?.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PER_TARGET) {
    return fail(`数量必须是 1-${MAX_PER_TARGET} 的整数`);
  }

  const length = Number(body?.length);
  if (!Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
    return fail(`位数必须是 ${MIN_LENGTH}-${MAX_LENGTH} 的整数`);
  }

  const alphabetResult = buildAlphabet(body);
  if ('error' in alphabetResult) return fail(alphabetResult.error);
  const { alphabet } = alphabetResult;

  const prefix = typeof body?.prefix === 'string' ? body.prefix.trim() : '';
  if (prefix.length > MAX_PREFIX_LEN) return fail(`前缀最长 ${MAX_PREFIX_LEN} 个字符`);
  if (/\s/.test(prefix)) return fail('前缀不能包含空格等空白字符');
  if (prefix.length + length > MAX_KEY_LENGTH) {
    return fail(`前缀 + 随机位总长不能超过 ${MAX_KEY_LENGTH}`);
  }

  // 组合空间不足直接拒绝：否则要么生成不满、要么在内存里去重打转
  const space = alphabet.length ** length;
  if (space < quantity) {
    return fail(
      `当前字符集与位数只有约 ${Math.floor(space).toLocaleString('en-US')} 种组合，不够生成 ${quantity} 张：请增加位数或放宽字符集`,
    );
  }

  const db = supabaseAdmin();

  const resolved = await resolveTargets(db, generateType, targetId);
  if ('error' in resolved) return fail(resolved.error);
  const targets = resolved;

  const totalRequested = targets.length * quantity;
  if (totalRequested > MAX_TOTAL) {
    return fail(
      `本批将生成 ${targets.length} × ${quantity} = ${totalRequested} 张，超过单批上限 ${MAX_TOTAL}：请减少数量或分批生成`,
    );
  }

  try {
    // 1) 先把每个目标的卡密商品准备好（互不依赖，并行）
    const products = await Promise.all(targets.map((t) => ensureProduct(db, t)));
    const failed = products.find((p) => 'error' in p) as { error: string } | undefined;
    if (failed) return fail(failed.error, 500);

    // 2) 逐目标生成（批内跨商品共用 taken：同一内容不在两个商品里重复出现，
    //    否则兑换时按 content 匹配会命中错商品）
    const taken = new Set<string>();
    const results = [];
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const product = products[i] as { id: string; created: boolean };
      const { keys, shortfall } = await generateForProduct(
        db,
        product.id,
        quantity,
        alphabet,
        length,
        prefix,
        taken,
      );
      results.push({
        target_type: target.target_type,
        target_id: target.target_id,
        target_name: target.target_name,
        group_name: target.group_name,
        card_product_id: product.id,
        product_created: product.created,
        requested: quantity,
        imported: keys.length,
        shortfall,
        keys,
      });
    }

    const totalImported = results.reduce((sum, r) => sum + r.imported, 0);
    return ok(
      {
        total_requested: totalRequested,
        total_imported: totalImported,
        total_shortfall: totalRequested - totalImported,
        created_products: products.filter((p) => (p as { created: boolean }).created).length,
        targets: results,
      },
      201,
    );
  } catch (e) {
    return fail(e instanceof Error ? e.message : '生成失败', 500);
  }
}

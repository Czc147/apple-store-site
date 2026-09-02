import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 单批最大导入条数，防止超大请求拖垮函数 */
const MAX_LINES = 5000;
/** 单条卡密最大长度 */
const MAX_KEY_LENGTH = 500;
/** 分块查询块大小（PostgREST 的 in 过滤需避免超长 URL） */
const CHUNK_SIZE = 500;

/**
 * 解析导入原文：
 * - txt：每行一个卡密
 * - csv：取每行第一列（支持双引号包裹）；首行含「卡密/内容/code…」视为表头跳过
 * 统一去 BOM、trim、去空行；超长行判为无效并计数
 */
function parseRaw(raw: string, format: 'txt' | 'csv'): { keys: string[]; skippedInvalid: number } {
  const lines = raw.replace(/^/, '').split(/\r\n|\r|\n/);
  const keys: string[] = [];
  let skippedInvalid = 0;

  lines.forEach((line, idx) => {
    // csv 模式只取第一列
    let cell = format === 'csv' ? line.split(',')[0] ?? '' : line;
    cell = cell.trim();
    // 去掉成对包裹的双引号（"KEY-001" → KEY-001）
    if (cell.length >= 2 && cell.startsWith('"') && cell.endsWith('"')) {
      cell = cell.slice(1, -1).trim();
    }
    if (!cell) return; // 空行
    // 表头识别（仅 csv 首行）
    if (format === 'csv' && idx === 0 && /卡密|内容|code|key|content/i.test(cell)) {
      skippedInvalid += 1;
      return;
    }
    if (cell.length > MAX_KEY_LENGTH) {
      skippedInvalid += 1;
      return;
    }
    keys.push(cell);
  });

  return { keys, skippedInvalid };
}

/** 分块查询商品下已存在的卡密内容（严格模式预检用） */
async function fetchExistingContents(cardProductId: string, contents: string[]): Promise<string[]> {
  const found = new Set<string>();
  const db = supabaseAdmin();
  for (let i = 0; i < contents.length; i += CHUNK_SIZE) {
    const part = contents.slice(i, i + CHUNK_SIZE);
    const { data, error } = await db
      .from('card_keys')
      .select('content')
      .eq('card_product_id', cardProductId)
      .in('content', part);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ content: string }>) {
      found.add(row.content);
    }
  }
  return [...found];
}

/**
 * POST /api/card-management/keys/import — 批量导入卡密（需登录）
 *
 * 请求体：
 * {
 *   card_product_id: string,        // 必填，商品须存在（不校验启用状态，允许先补货再启用）
 *   raw: string,                    // 必填，原始文本
 *   format?: 'txt' | 'csv',         // 默认 txt（每行一个）；csv 取每行第一列
 *   skip_duplicates?: boolean       // 默认 true
 * }
 *
 * 两种模式：
 * - skip_duplicates = true（默认）：重复（批内/库内）自动跳过，返回明细
 * - skip_duplicates = false：严格模式，任何重复 → 整体拒绝，不写入任何数据
 *
 * 事务性：写入为单条 insert，天然原子——全部成功或全部失败，无中间态。
 * 去重兜底：数据库唯一约束 (card_product_id, content)。
 *
 * 响应 201：{ card_product_id, parsed, imported, skipped_duplicates, skipped_invalid }
 */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  const cardProductId =
    typeof body?.card_product_id === 'string' ? body.card_product_id.trim() : '';
  const raw = typeof body?.raw === 'string' ? body.raw : '';
  const format: 'txt' | 'csv' = body?.format === 'csv' ? 'csv' : 'txt';
  const skipDuplicates =
    typeof body?.skip_duplicates === 'boolean' ? body.skip_duplicates : true;

  if (!cardProductId) return fail('card_product_id 为必填字段');
  if (!raw.trim()) return fail('raw 为必填字段（待导入的卡密文本）');

  const db = supabaseAdmin();

  // 商品必须存在
  const { data: product, error: productErr } = await db
    .from('card_products')
    .select('id')
    .eq('id', cardProductId)
    .maybeSingle();
  if (productErr) return fail(productErr.message, 500);
  if (!product) return fail('卡密商品不存在', 404);

  // 解析原文
  const { keys, skippedInvalid } = parseRaw(raw, format);
  if (keys.length === 0) return fail('未解析到有效卡密，请检查文本格式');
  if (keys.length > MAX_LINES) {
    return fail(`单批最多导入 ${MAX_LINES} 条，本批 ${keys.length} 条`);
  }

  // 批内去重（保持首次出现顺序）
  const unique = [...new Set(keys)];
  const intraDuplicates = keys.length - unique.length;

  try {
    if (!skipDuplicates) {
      // 严格模式：批内重复 → 整体拒绝
      if (intraDuplicates > 0) {
        return fail(
          `严格模式下检测到 ${intraDuplicates} 条批内重复卡密，已整体拒绝（未写入任何数据）`,
          409,
        );
      }
      // 严格模式：与库内已有卡密比对（分块查询）→ 有重复则整体拒绝
      const existing = await fetchExistingContents(cardProductId, unique);
      if (existing.length > 0) {
        const sample = existing.slice(0, 5).join('、');
        return fail(
          `严格模式下检测到 ${existing.length} 条卡密已存在（如：${sample}），已整体拒绝（未写入任何数据）`,
          409,
        );
      }
    }

    // 入库：单条写入语句天然原子
    // - 跳过模式：upsert + ignoreDuplicates → INSERT ... ON CONFLICT DO NOTHING
    // - 严格模式：普通 insert（已通过预检；竞态下的唯一冲突会整体报错回滚）
    const rows = unique.map((content) => ({ card_product_id: cardProductId, content }));
    const writeQuery = skipDuplicates
      ? db
          .from('card_keys')
          .upsert(rows, { onConflict: 'card_product_id,content', ignoreDuplicates: true })
      : db.from('card_keys').insert(rows);
    const { data: inserted, error: insertErr } = await writeQuery.select('id');
    if (insertErr) {
      // 严格模式下预检通过但发生并发写入冲突（唯一约束兜底）：整体未写入
      if (!skipDuplicates && (insertErr as { code?: string }).code === '23505') {
        return fail('严格模式下检测到重复卡密（可能为并发写入），已整体拒绝', 409);
      }
      return fail(`导入失败：${insertErr.message}`, 500);
    }

    const imported = (inserted ?? []).length;
    // 跳过数 = 批内重复 + 与库内重复（后者 = 去重后总数 − 实际插入数）
    const skippedDuplicates = intraDuplicates + (unique.length - imported);

    return ok(
      {
        card_product_id: cardProductId,
        parsed: keys.length,
        imported,
        skipped_duplicates: skippedDuplicates,
        skipped_invalid: skippedInvalid,
      },
      201,
    );
  } catch (e) {
    return fail(e instanceof Error ? e.message : '导入失败', 500);
  }
}

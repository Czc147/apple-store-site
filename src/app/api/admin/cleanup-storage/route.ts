import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 允许清理的桶（白名单）。avatars 是固定路径覆盖式上传，默认不列，避免误清自定义头像 */
const ALLOWED_BUCKETS = ['images', 'daily'] as const;
type CleanupBucket = (typeof ALLOWED_BUCKETS)[number];

/** 孤儿判定：文件只在「被任何内容表引用」时才保留；此处列出所有可能引用存储对象的列 */
const REFERENCE_COLUMNS: Array<{ table: string; columns: string[] }> = [
  { table: 'activities', columns: ['image_url', 'redeem_image_url'] },
  { table: 'daily_picks', columns: ['cover_url', 'media_path'] },
  { table: 'major_units', columns: ['image_url'] },
  { table: 'profiles', columns: ['avatar_url'] },
  { table: 'sub_units', columns: ['redeem_image_url'] },
  { table: 'subscriptions', columns: ['redeem_image_url'] },
  { table: 'subscription_products', columns: ['cover_url', 'media_path'] },
  { table: 'user_entitlements', columns: ['media_url', 'media_path'] },
];

/** 孤儿年龄门槛：未满 N 天的文件即使暂未被引用也不清理，保护「刚上传还没保存表单」的内容 */
const ORPHAN_AGE_DAYS = 14;
const ORPHAN_AGE_MS = ORPHAN_AGE_DAYS * 24 * 60 * 60 * 1000;

/** 单次递归列出某桶内的全部对象（含子目录），返回带完整路径的记录 */
async function listAllObjects(db: ReturnType<typeof supabaseAdmin>, bucket: string) {
  const objects: Array<{
    bucket: string;
    fullPath: string;
    name: string;
    bytes: number;
    createdAt: string | null;
  }> = [];

  async function walk(folder: string) {
    const { data, error } = await db.storage.from(bucket).list(folder, { limit: 1000 });
    if (error) throw new Error(error.message);
    for (const item of data ?? []) {
      const name = item.name;
      const childPath = folder ? `${folder}/${name}` : name;
      if (item.id === null) {
        // 目录条目；递归进入
        await walk(childPath);
      } else {
        objects.push({
          bucket,
          fullPath: childPath,
          name,
          bytes: Number((item.metadata as { size?: number } | null)?.size ?? 0),
          createdAt: item.created_at ?? null,
        });
      }
    }
  }

  await walk('');
  return objects;
}

/** 把所有可能引用存储对象的列值拼成一个大字符串，供子串匹配判断某个对象是否被引用 */
async function buildReferenceBlob(db: ReturnType<typeof supabaseAdmin>): Promise<string> {
  const parts: string[] = [];
  for (const { table, columns } of REFERENCE_COLUMNS) {
    try {
      const { data, error } = await db.from(table).select(columns.join(','));
      if (error) continue;
      for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        for (const col of columns) {
          const v = row[col];
          if (typeof v === 'string' && v.length) parts.push(v);
        }
      }
    } catch {
      // 缺表/权限异常时跳过该表，不影响其它表
    }
  }
  return parts.join('\n');
}

/**
 * POST /api/admin/cleanup-storage — 孤儿文件清理（安全：仅删除「未被任何内容表引用」且「已满 14 天」的对象）
 * body：
 *   { mode: 'preview' }            只扫描并返回候选清单，不删除（默认）
 *   { mode: 'execute' }            先扫描，再批量删除候选（默认桶 images/daily）
 *   { mode, buckets?: string[] }   可指定桶（须在白名单内）
 */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await req.json().catch(() => null);
  const mode = (body?.mode === 'execute' ? 'execute' : 'preview') as 'preview' | 'execute';

  const rawBuckets = Array.isArray(body?.buckets) ? body.buckets : [];
  const buckets = rawBuckets.length
    ? rawBuckets.filter((b: unknown): b is CleanupBucket =>
        (ALLOWED_BUCKETS as readonly string[]).includes(b as string),
      )
    : (ALLOWED_BUCKETS as readonly string[]).slice() as CleanupBucket[];
  if (buckets.length === 0) return fail('没有可清理的桶（bucket 不在白名单内）');

  const db = supabaseAdmin();
  const blob = await buildReferenceBlob(db);
  const now = Date.now();

  const candidates: Array<{
    bucket: string;
    fullPath: string;
    bytes: number;
    createdAt: string | null;
  }> = [];
  let scanned = 0;
  let scannedBytes = 0;
  let referenced = 0;
  let referencedBytes = 0;

  for (const bucket of buckets) {
    const objects = await listAllObjects(db, bucket);
    for (const obj of objects) {
      scanned += 1;
      scannedBytes += obj.bytes;
      // 引用判定：命中完整对象路径或裸文件名即视为被引用（裸名匹配只会更保守地保留，绝不误删）
      if (blob.includes(obj.fullPath) || blob.includes(obj.name)) {
        referenced += 1;
        referencedBytes += obj.bytes;
        continue;
      }
      if (!obj.createdAt) continue;
      if (now - new Date(obj.createdAt).getTime() < ORPHAN_AGE_MS) continue;
      candidates.push(obj);
    }
  }

  const orphanBytes = candidates.reduce((s, c) => s + c.bytes, 0);

  if (mode === 'execute' && candidates.length > 0) {
    let deleted = 0;
    let deletedBytes = 0;
    const errors: string[] = [];
    // 按桶分组，每批 100 个删除（storage.remove 支持数组）
    const sizeMap = new Map(candidates.map((c) => [c.bucket + '/' + c.fullPath, c]));
    const byBucket = new Map<string, string[]>();
    for (const c of candidates) {
      const arr = byBucket.get(c.bucket) ?? [];
      arr.push(c.fullPath);
      byBucket.set(c.bucket, arr);
    }
    for (const [bucket, paths] of byBucket) {
      for (let i = 0; i < paths.length; i += 100) {
        const batch = paths.slice(i, i + 100);
        const { error } = await db.storage.from(bucket).remove(batch);
        if (error) {
          errors.push(`${bucket}: ${error.message}`);
          continue;
        }
        deleted += batch.length;
        for (const p of batch) {
          const o = sizeMap.get(bucket + '/' + p);
          if (o) deletedBytes += o.bytes;
        }
      }
    }
    return ok({ mode, deleted, deletedBytes, errors }, 200);
  }

  // preview
  return ok(
    {
      mode: 'preview',
      scanned,
      scannedBytes,
      referenced,
      referencedBytes,
      orphanCount: candidates.length,
      orphanBytes,
      candidates: candidates.slice(0, 300),
    },
    200,
  );
}

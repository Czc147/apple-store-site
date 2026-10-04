import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const TARGET_TYPES = [
  'sub_unit',
  'activity',
  'subscription',
  'coupon',
  'home_section',
  'daily_pick',
] as const;
const ACTIONS = ['publish', 'unpublish'] as const;
const PATCH_ACTIONS = ['cancel', 'retry', 'run_now'] as const;

type TargetType = (typeof TARGET_TYPES)[number];
type Action = (typeof ACTIONS)[number];
type PatchAction = (typeof PATCH_ACTIONS)[number];

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function isTargetType(value: unknown): value is TargetType {
  return typeof value === 'string' && (TARGET_TYPES as readonly string[]).includes(value);
}

function isAction(value: unknown): value is Action {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value);
}

function isPatchAction(value: unknown): value is PatchAction {
  return typeof value === 'string' && (PATCH_ACTIONS as readonly string[]).includes(value);
}

function friendlyRpcError(message: string): string {
  if (message.includes('TARGET_NOT_FOUND')) return '目标内容不存在或已被删除';
  if (message.includes('INVALID_TARGET_TYPE')) return '不支持的内容类型';
  if (message.includes('INVALID_STATE')) return '当前任务状态不允许这个操作';
  if (message.includes('uq_scheduled_publications_pending') || message.includes('duplicate key')) {
    return '这个内容已有同方向的待上线任务，请先取消原任务';
  }
  return message;
}

/** GET /api/admin/publications — 预上线任务列表 */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const params = req.nextUrl.searchParams;
  const status = params.get('status')?.trim();
  const targetType = params.get('target_type')?.trim();

  let query = supabaseAdmin()
    .from('scheduled_publications')
    .select('*')
    .order('scheduled_at', { ascending: false })
    .limit(100);
  if (status) query = query.eq('status', status);
  if (targetType) query = query.eq('target_type', targetType);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return ok(data);
}

/** POST /api/admin/publications — 创建预上线 / 定时下线任务 */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');
  if (!isTargetType(body.target_type)) return fail('target_type 无效');
  if (!isUuid(body.target_id)) return fail('target_id 无效');
  if (!isAction(body.action)) return fail('action 必须为 publish / unpublish');
  if (body.action === 'unpublish' && body.hide_now === true) {
    return fail('定时下线任务不支持“先隐藏”，请直接创建发布任务');
  }

  const scheduledTime = Date.parse(String(body.scheduled_at ?? ''));
  if (!Number.isFinite(scheduledTime)) return fail('scheduled_at 必须是有效时间');
  if (scheduledTime < Date.now() - 5 * 60 * 1000) {
    return fail('上线时间不能早于当前时间超过 5 分钟');
  }
  if (scheduledTime > Date.now() + 5 * 365 * 24 * 3600 * 1000) {
    return fail('上线时间最远只能设置到 5 年后');
  }

  const { data, error } = await supabaseAdmin().rpc('create_scheduled_publication', {
    p_target_type: body.target_type,
    p_target_id: body.target_id,
    p_action: body.action,
    p_scheduled_at: new Date(scheduledTime).toISOString(),
    p_hide_now: body.hide_now === true,
  });
  if (error) return fail(friendlyRpcError(error.message), error.code === '23505' ? 409 : 500);
  return ok(data, 201);
}

/** PATCH /api/admin/publications — 取消 / 重试 / 立即执行 */
export async function PATCH(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');
  if (!isUuid(body.id)) return fail('id 无效');
  if (!isPatchAction(body.action)) return fail('action 必须为 cancel / retry / run_now');

  const db = supabaseAdmin();
  const { data, error } = await db.rpc('admin_update_scheduled_publication', {
    p_id: body.id,
    p_action: body.action,
  });
  if (error) {
    const invalidState = error.message.includes('INVALID_STATE');
    return fail(friendlyRpcError(error.message), invalidState ? 409 : 500);
  }

  let publication = data;
  let processed = 0;
  if (body.action === 'run_now') {
    const run = await db.rpc('process_scheduled_publications');
    if (run.error) return fail(`任务已触发，但执行失败：${run.error.message}`, 500);
    processed = Number(run.data ?? 0);
    const refreshed = await db
      .from('scheduled_publications')
      .select('*')
      .eq('id', body.id)
      .maybeSingle();
    if (refreshed.error) return fail(refreshed.error.message, 500);
    publication = refreshed.data;
  }

  return ok({ publication, processed });
}

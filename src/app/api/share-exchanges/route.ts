import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const MAX_URL_LEN = 600;
const MAX_NOTE_LEN = 300;
/** 同时挂着的待处理交换上限：防止有人刷满后台待办 */
const MAX_PENDING = 5;

/** 只收本仓 storage 的图片直链（与帖子配图同一道防线，见 /api/community 的 parseImages） */
function isOurStorageUrl(url: string): boolean {
  let host = '';
  try {
    host = new URL(process.env.SUPABASE_URL ?? '').host;
  } catch {
    host = '';
  }
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      (!host || u.host === host) &&
      u.pathname.startsWith('/storage/v1/object/public/')
    );
  } catch {
    return false;
  }
}

export interface ShareExchangeRow {
  id: string;
  user_id: string;
  user_email: string | null;
  resource_kind: 'link' | 'image';
  resource_url: string;
  resource_note: string | null;
  ref_image_url: string;
  wanted_sub_unit_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'canceled';
  review_note: string | null;
  handled_at: string | null;
  created_at: string;
}

/**
 * GET /api/share-exchanges — 我的交换列表（需登录）
 *
 * **resource_url 在通过前不返回**（置 null）。用户自己交出去的东西，
 * 通过前也看不到——这不是 UI 遮掩，是接口层就不给：交换的规矩是
 * "你给什么、我给什么，成不成由官方定"，中途反悔就撤回，不该靠随时能看自己的资源
 * 而把对方的东西先看到。详见迁移 028 的注释。
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('share_exchanges')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return fail(error.message, 500);

  const rows = (data ?? []) as ShareExchangeRow[];

  // 想换的小单元（用户能看到的只有"名字"）
  const subIds = Array.from(new Set(rows.map((r) => r.wanted_sub_unit_id)));
  const subById = new Map<string, { name: string; redeem_image_url: string | null }>();
  if (subIds.length > 0) {
    const { data: subs } = await db
      .from('sub_units')
      .select('id, name, redeem_image_url')
      .in('id', subIds);
    for (const s of subs ?? []) {
      subById.set(s.id as string, {
        name: s.name as string,
        redeem_image_url: (s.redeem_image_url as string | null) ?? null,
      });
    }
  }

  return ok({
    items: rows.map((r) => {
      const sub = subById.get(r.wanted_sub_unit_id);
      const unlocked = r.status === 'approved';
      return {
        id: r.id,
        status: r.status,
        resource_kind: r.resource_kind,
        // 通过后才解锁；其余状态一律 null
        resource_url: unlocked ? r.resource_url : null,
        resource_note: unlocked ? r.resource_note : null,
        ref_image_url: r.ref_image_url,
        wanted: {
          id: r.wanted_sub_unit_id,
          name: sub?.name ?? '（该单元已下架）',
        },
        review_note: r.review_note,
        handled_at: r.handled_at,
        created_at: r.created_at,
      };
    }),
  });
}

/**
 * POST /api/share-exchanges — 发起一次交换（需登录）
 * 请求体：{ resource_kind, resource_url, resource_note?, ref_image_url, wanted_sub_unit_id }
 *
 * 资源链接是**用户自己填的网盘分享地址**，不是本仓 upload 的产物，
 * 所以不做 storage 域名校验（做了反而没法用）；但参考图必须来自本仓 upload ——
 * 那张是我们渲染给官方看的，外链会让后台预览失效甚至被当图床。
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);
  if (!rateLimit('share-create', getClientIp(req), 10, 60_000)) {
    return fail('操作过于频繁，请稍后再试', 429);
  }

  const body = await parseBody(req);
  const resourceKind = body?.resource_kind === 'image' ? 'image' : 'link';
  const resourceUrl =
    typeof body?.resource_url === 'string' ? body.resource_url.trim() : '';
  const resourceNote =
    typeof body?.resource_note === 'string' ? body.resource_note.trim() : '';
  const refImageUrl =
    typeof body?.ref_image_url === 'string' ? body.ref_image_url.trim() : '';
  const wantedId =
    typeof body?.wanted_sub_unit_id === 'string' ? body.wanted_sub_unit_id.trim() : '';

  if (!resourceUrl) return fail('请填写资源链接或上传分享图');
  if (resourceUrl.length > MAX_URL_LEN) return fail('资源地址过长');
  if (resourceKind === 'link' && !/^https?:\/\//i.test(resourceUrl)) {
    return fail('资源链接需要以 http:// 或 https:// 开头');
  }
  if (resourceKind === 'image' && !isOurStorageUrl(resourceUrl)) {
    return fail('分享图请通过上方按钮上传');
  }
  if (!refImageUrl) return fail('请上传参考图');
  if (!isOurStorageUrl(refImageUrl)) return fail('参考图请通过上方按钮上传');
  if (!wantedId) return fail('请选择想换的小单元');
  if (resourceNote.length > MAX_NOTE_LEN) return fail('说明过长');

  const db = supabaseAdmin();

  // 目标小单元必须存在
  const { data: sub } = await db
    .from('sub_units')
    .select('id')
    .eq('id', wantedId)
    .maybeSingle();
  if (!sub) return fail('该小单元不存在', 404);

  // 待处理不能堆太多：后台是人工审的，刷满待办等于把这条通道堵死
  const { count } = await db
    .from('share_exchanges')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'pending');
  if ((count ?? 0) >= MAX_PENDING) {
    return fail(`你还有 ${MAX_PENDING} 条交换在等官方处理，请先等一等`, 409);
  }

  const { data, error } = await db
    .from('share_exchanges')
    .insert({
      user_id: user.id,
      user_email: user.email,
      resource_kind: resourceKind,
      resource_url: resourceUrl,
      resource_note: resourceNote || null,
      ref_image_url: refImageUrl,
      wanted_sub_unit_id: wantedId,
    })
    .select('id, status, created_at')
    .single();
  if (error) return fail(error.message, 500);

  return ok(data, 201);
}

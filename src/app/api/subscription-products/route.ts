import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody, toSortOrder, toNullableText } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** POST /api/subscription-products — 给某订阅新增一个商品（需管理员） */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');

  const subscriptionId = typeof body.subscription_id === 'string' ? body.subscription_id.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!subscriptionId) return fail('subscription_id 为必填字段');
  if (!title) return fail('title 为必填字段');

  // 校验订阅存在
  const { data: sub, error: subErr } = await supabaseAdmin()
    .from('subscriptions')
    .select('id')
    .eq('id', subscriptionId)
    .maybeSingle();
  if (subErr) return fail(subErr.message, 500);
  if (!sub) return fail('订阅不存在', 404);

  const { data, error } = await supabaseAdmin()
    .from('subscription_products')
    .insert({
      subscription_id: subscriptionId,
      title,
      description: toNullableText(body.description),
      cover_url: toNullableText(body.cover_url),
      media_path: toNullableText(body.media_path),
      link_url: toNullableText(body.link_url),
      sort_order: toSortOrder(body.sort_order),
    })
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok(data, 201);
}

/**
 * GET /api/subscription-products — 订阅仓库商品列表（管理员）
 * 筛选：?subscription_id= （按订阅过滤）；按 sort_order 升序。
 * 为含媒体文件的行现签 1 小时预览链接（media_preview_url，仅供后台展示）。
 */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const subId = req.nextUrl.searchParams.get('subscription_id')?.trim() || null;
  let query = supabaseAdmin()
    .from('subscription_products')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (subId) query = query.eq('subscription_id', subId);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const withPreview = await Promise.all(
    rows.map(async (row) => {
      const mediaPath = typeof row.media_path === 'string' ? row.media_path : null;
      if (!mediaPath) return { ...row, media_preview_url: null };
      const { data: signed, error: signErr } = await supabaseAdmin()
        .storage.from('daily')
        .createSignedUrl(mediaPath, 3600);
      return {
        ...row,
        media_preview_url: signErr ? null : signed.signedUrl,
      };
    }),
  );
  return ok({ items: withPreview });
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody, toSortOrder, toNullableText } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { PUT as putById, DELETE as deleteById } from './[id]/route';

export const dynamic = 'force-dynamic';

/** GET /api/subscriptions — 订阅套餐列表（sort_order 升序） */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }
  const { data, error } = await supabaseAdmin()
    .from('subscriptions')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return fail(error.message, 500);
  return ok(data);
}

/** POST /api/subscriptions — 新建订阅套餐（需登录） */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }
  const body = await parseBody(req);
  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    return fail('name 为必填字段');
  }

  const price =
    typeof body.price === 'number' && Number.isFinite(body.price)
      ? body.price
      : 0;

  const { data, error } = await supabaseAdmin()
    .from('subscriptions')
    .insert({
      name: body.name.trim(),
      price,
      duration: toNullableText(body.duration),
      payment_url: toNullableText(body.payment_url),
      sort_order: toSortOrder(body.sort_order),
    })
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok(data, 201);
}

/** PUT /api/subscriptions — 更新（请求体携带 id，等价于 PUT /api/subscriptions/:id） */
export async function PUT(req: NextRequest) {
  const peek = await parseBody(req.clone());
  const id = typeof peek?.id === 'string' && peek.id ? peek.id : null;
  if (!id) return fail('缺少 id 字段（或使用 PUT /api/subscriptions/:id）');
  return putById(req, { params: { id } });
}

/** DELETE /api/subscriptions?id=xxx — 删除（id 走 query 或请求体） */
export async function DELETE(req: NextRequest) {
  let id = req.nextUrl.searchParams.get('id');
  if (!id) {
    const peek = await parseBody(req.clone());
    id = typeof peek?.id === 'string' && peek.id ? peek.id : null;
  }
  if (!id) return fail('缺少 id（query 参数或请求体 id 字段）');
  return deleteById(req, { params: { id } });
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody, toSortOrder, toNullableText } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { PUT as putById, DELETE as deleteById } from './[id]/route';

export const dynamic = 'force-dynamic';

/** GET /api/sub-units?major_unit_id=xxx — 小单元列表（可按大单元过滤） */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }
  const majorUnitId = req.nextUrl.searchParams.get('major_unit_id');
  let query = supabaseAdmin()
    .from('sub_units')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (majorUnitId) query = query.eq('major_unit_id', majorUnitId);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return ok(data);
}

/** POST /api/sub-units — 新建小单元（需登录） */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }
  const body = await parseBody(req);
  if (!body || typeof body.major_unit_id !== 'string' || !body.major_unit_id) {
    return fail('major_unit_id 为必填字段');
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return fail('name 为必填字段');
  }

  const price =
    typeof body.price === 'number' && Number.isFinite(body.price)
      ? body.price
      : 0;

  const { data, error } = await supabaseAdmin()
    .from('sub_units')
    .insert({
      major_unit_id: body.major_unit_id,
      name: body.name.trim(),
      sort_order: toSortOrder(body.sort_order),
      price,
      payment_url: toNullableText(body.payment_url),
    })
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok(data, 201);
}

/** PUT /api/sub-units — 更新（请求体携带 id，等价于 PUT /api/sub-units/:id） */
export async function PUT(req: NextRequest) {
  const peek = await parseBody(req.clone());
  const id = typeof peek?.id === 'string' && peek.id ? peek.id : null;
  if (!id) return fail('缺少 id 字段（或使用 PUT /api/sub-units/:id）');
  return putById(req, { params: { id } });
}

/** DELETE /api/sub-units?id=xxx — 删除（id 走 query 或请求体） */
export async function DELETE(req: NextRequest) {
  let id = req.nextUrl.searchParams.get('id');
  if (!id) {
    const peek = await parseBody(req.clone());
    id = typeof peek?.id === 'string' && peek.id ? peek.id : null;
  }
  if (!id) return fail('缺少 id（query 参数或请求体 id 字段）');
  return deleteById(req, { params: { id } });
}

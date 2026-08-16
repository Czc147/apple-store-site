import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody, toSortOrder, toNullableText } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { PUT as putById, DELETE as deleteById } from './[id]/route';

// API 一律动态执行，避免构建时预取数据库
export const dynamic = 'force-dynamic';

/** GET /api/major-units — 大单元列表（sort_order 升序） */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }
  const { data, error } = await supabaseAdmin()
    .from('major_units')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return fail(error.message, 500);
  return ok(data);
}

/** POST /api/major-units — 新建大单元（需登录） */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) {
    return fail('SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 503);
  }
  const body = await parseBody(req);
  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    return fail('name 为必填字段');
  }
  const { data, error } = await supabaseAdmin()
    .from('major_units')
    .insert({
      name: body.name.trim(),
      image_url: toNullableText(body.image_url),
      link_url: toNullableText(body.link_url),
      sort_order: toSortOrder(body.sort_order),
    })
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok(data, 201);
}

/** PUT /api/major-units — 更新（请求体携带 id，等价于 PUT /api/major-units/:id） */
export async function PUT(req: NextRequest) {
  const peek = await parseBody(req.clone());
  const id = typeof peek?.id === 'string' && peek.id ? peek.id : null;
  if (!id) return fail('缺少 id 字段（或使用 PUT /api/major-units/:id）');
  return putById(req, { params: { id } });
}

/** DELETE /api/major-units?id=xxx — 删除（id 走 query 或请求体） */
export async function DELETE(req: NextRequest) {
  let id = req.nextUrl.searchParams.get('id');
  if (!id) {
    const peek = await parseBody(req.clone());
    id = typeof peek?.id === 'string' && peek.id ? peek.id : null;
  }
  if (!id) return fail('缺少 id（query 参数或请求体 id 字段）');
  return deleteById(req, { params: { id } });
}

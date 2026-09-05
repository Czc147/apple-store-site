import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody, toSortOrder, toNullableText, toStringArray } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { PUT as putById, DELETE as deleteById } from './[id]/route';

// API 一律动态执行，避免构建时预取数据库
export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

function toLayout(v: unknown): 'carousel' | 'grid' {
  return v === 'grid' ? 'grid' : 'carousel';
}

/** GET /api/home-sections — 首页板块列表（sort_order 升序；无敏感数据，公开） */
export async function GET() {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);
  const { data, error } = await supabaseAdmin()
    .from('home_sections')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return fail(error.message, 500);
  return ok(data);
}

/** POST /api/home-sections — 新建板块（需登录） */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  if (!body || typeof body.title !== 'string' || !body.title.trim()) {
    return fail('title 为必填字段');
  }

  const { data, error } = await supabaseAdmin()
    .from('home_sections')
    .insert({
      title: body.title.trim(),
      subtitle: toNullableText(body.subtitle),
      layout: toLayout(body.layout),
      featured_only: body.featured_only === true,
      major_unit_ids: toStringArray(body.major_unit_ids),
      enabled: body.enabled !== false,
      sort_order: toSortOrder(body.sort_order),
    })
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok(data, 201);
}

/** PUT /api/home-sections — 更新（请求体携带 id，等价于 PUT /api/home-sections/:id） */
export async function PUT(req: NextRequest) {
  const peek = await parseBody(req.clone());
  const id = typeof peek?.id === 'string' && peek.id ? peek.id : null;
  if (!id) return fail('缺少 id 字段（或使用 PUT /api/home-sections/:id）');
  return putById(req, { params: { id } });
}

/** DELETE /api/home-sections?id=xxx — 删除（id 走 query 或请求体） */
export async function DELETE(req: NextRequest) {
  let id = req.nextUrl.searchParams.get('id');
  if (!id) {
    const peek = await parseBody(req.clone());
    id = typeof peek?.id === 'string' && peek.id ? peek.id : null;
  }
  if (!id) return fail('缺少 id（query 参数或请求体 id 字段）');
  return deleteById(req, { params: { id } });
}

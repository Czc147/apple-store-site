import type { NextRequest } from 'next/server';
import { fail } from '@/lib/api';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const FORWARD_HEADERS = [
  'accept',
  'apikey',
  'authorization',
  'content-type',
  'x-client-info',
  'x-supabase-api-version',
];

async function proxy(req: NextRequest): Promise<Response> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return fail('SUPABASE_NOT_CONFIGURED', 503);
  if (!rateLimit('supabase-auth-proxy', getClientIp(req), 120, 60_000)) {
    return fail('操作过于频繁，请稍后再试', 429);
  }

  let target: URL;
  try {
    const authPath = req.nextUrl.pathname.replace(/^\/api\/supabase\/auth\//, '');
    target = new URL(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/${authPath}${req.nextUrl.search}`);
  } catch {
    return fail('SUPABASE_URL 配置不正确', 500);
  }
  if (!target.pathname.startsWith('/auth/v1/')) return fail('无效的认证请求', 400);

  const headers = new Headers();
  for (const header of FORWARD_HEADERS) {
    const value = req.headers.get(header);
    if (value) headers.set(header, value);
  }
  const clientIp = getClientIp(req);
  if (clientIp && clientIp !== 'unknown') headers.set('x-forwarded-for', clientIp);
  else headers.delete('x-forwarded-for');

  const method = req.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : await req.arrayBuffer();
  const upstream = await fetch(target, {
    method,
    headers,
    body,
    cache: 'no-store',
    redirect: 'manual',
  });

  const responseHeaders = new Headers(upstream.headers);
  for (const header of ['content-encoding', 'content-length', 'transfer-encoding']) {
    responseHeaders.delete(header);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;

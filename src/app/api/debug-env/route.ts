import { NextResponse } from 'next/server';

// 临时诊断端点：定位 Netlify 线上 fetch failed 根因，问题解决后删除
export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.SUPABASE_URL ?? '';
  const anon = process.env.SUPABASE_ANON_KEY ?? '';
  const out: Record<string, unknown> = {
    urlLen: url.length,
    urlHead: url.slice(0, 12),
    urlTail: url.slice(-8),
    hasAnon: anon.length > 0,
    hasService: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').length > 0,
  };
  try {
    const r = await fetch(`${url}/rest/v1/major_units?select=id`, {
      headers: { apikey: anon, authorization: `Bearer ${anon}` },
      cache: 'no-store',
    });
    out.directStatus = r.status;
    out.body = (await r.text()).slice(0, 200);
  } catch (e) {
    out.err = String(e);
    out.cause = String((e as { cause?: unknown })?.cause ?? 'none');
  }
  return NextResponse.json(out);
}

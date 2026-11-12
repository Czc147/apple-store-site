import { NextResponse, type NextRequest } from 'next/server';
import { bypassMaintenance } from '@/siteMaintenance/logic';
import { readMaintenance } from '@/siteMaintenance/server';
import { verifyMaintenanceAdmin } from '@/siteMaintenance/admin-session';

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (bypassMaintenance(path)) return NextResponse.next();
  if (path.startsWith('/api/') && await verifyMaintenanceAdmin(req.cookies.get('admin_session')?.value)) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  }
  let closed = true;
  try { closed = (await readMaintenance()).enabled; } catch { /* Failed reads must not reopen a closed site. */ }
  if (!closed) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  }
  const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'Retry-After': '300', 'X-Robots-Tag': 'noindex, nofollow' };
  if (path.startsWith('/api/') || !['GET', 'HEAD'].includes(req.method)) {
    return NextResponse.json({ error: '网站维护中，请稍后再试', code: 'SITE_MAINTENANCE' }, { status: 503, headers });
  }
  const target = req.nextUrl.clone();
  target.pathname = '/maintenance';
  target.search = '';
  return NextResponse.rewrite(target, { status: 503, headers });
}

// Keep data/RSC requests covered; only compiled assets avoid the middleware entirely.
export const config = { matcher: ['/((?!_next/static/|_next/image|favicon.ico|icon.svg|apple-icon.png).*)'] };

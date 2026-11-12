import { readMaintenance } from '@/siteMaintenance/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
  try { return Response.json({ ...await readMaintenance(), serverNow: Date.now() }, { headers }); }
  catch { return Response.json({ enabled: true, error: '暂时无法查询网站状态，请稍后再试' }, { status: 503, headers }); }
}

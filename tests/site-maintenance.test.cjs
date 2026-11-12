const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, api } = require('./helpers/load-source.cjs');
const logic = () => loadSource('src/siteMaintenance/logic.ts');
const config = { enabled: true, deadline: '2026-11-13T10:00:00+08:00', title: 'Zorvin 暂时维护中', description: '正在维护，请稍后访问。' };

test('countdown uses absolute deadline, clamps at zero and never changes enabled state', () => {
  const { getTimeLeft, parseMaintenance } = logic();
  const saved = parseMaintenance(config);
  assert.deepEqual(getTimeLeft(Date.parse(config.deadline), Date.parse(config.deadline) - 90061000), { days: 1, hours: 1, minutes: 1, seconds: 1 });
  assert.deepEqual(getTimeLeft(Date.parse(config.deadline), Date.parse(config.deadline) + 5000), { days: 0, hours: 0, minutes: 0, seconds: 0 });
  assert.equal(saved.enabled, true);
  assert.equal(getTimeLeft(NaN, 0), null);
});
test('settings reject invalid/ambiguous dates and nonboolean flags; missing key defaults off', () => {
  const { parseMaintenance, DEFAULT_MAINTENANCE } = logic();
  assert.equal(DEFAULT_MAINTENANCE.enabled, false);
  for (const patch of [{ enabled: 'false' }, { deadline: '2026-11-13T10:00' }, { deadline: 'bad' }, { title: 'a'.repeat(81) }, { description: 'a'.repeat(501) }]) {
    assert.throws(() => parseMaintenance({ ...config, ...patch }));
  }
  assert.equal(parseMaintenance({ ...config, deadline: '' }).deadline, null);
  assert.equal(parseMaintenance({ ...config, title: '  ' }).title, DEFAULT_MAINTENANCE.title);
  assert.equal(parseMaintenance({ ...config, deadline: '2020-01-01T00:00:00Z' }).enabled, true);
});
test('only exact admin access and maintenance infrastructure bypass gating', () => {
  const { bypassMaintenance } = logic();
  for (const p of ['/admin', '/admin/login', '/api/admin/maintenance', '/api/auth/login', '/api/auth/logout', '/api/maintenance', '/maintenance', '/_next/static/test.js', '/favicon.ico']) assert.equal(bypassMaintenance(p), true, p);
  for (const p of ['/', '/login', '/password-reset', '/shop/item', '/api/orders', '/api/auth/login-events', '/api/supabase/auth/user', '/administrator', '/api/admin-other', '/api/maintenance-other', '/anything.png', '/_next/data/build/index.json']) assert.equal(bypassMaintenance(p), false, p);
});
test('reader selects only atomic setting, absent defaults off, config errors never silently open', async () => {
  const { readMaintenance } = loadSource('src/siteMaintenance/server.ts');
  const env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-key' };
  let request;
  const read = body => readMaintenance(env, async (url, options) => { request = { url: String(url), options }; return Response.json(body); });
  assert.equal((await read([])).enabled, false);
  assert.match(request.url, /key=eq.site_maintenance/);
  assert.equal(request.options.cache, 'no-store');
  assert.equal((await read([{ value: JSON.stringify(config) }])).enabled, true);
  await assert.rejects(() => read([{ value: 'broken' }]));
  await assert.rejects(() => readMaintenance(env, async () => new Response('', { status: 500 })));
  await assert.rejects(() => readMaintenance(env, async () => { throw Error('offline'); }));
  assert.equal((await readMaintenance({}, async () => { throw Error('should not fetch'); })).enabled, false);
});
function adminRoute(authorized = true) {
  let saved;
  const db = { from: () => ({ upsert: async value => { saved = value; return { error: null }; } }) };
  return { route: loadSource('src/app/api/admin/maintenance/route.ts', {
    '@/lib/auth': { checkAdmin: () => authorized }, '@/lib/api': api,
    '@/lib/supabase/admin': { isSupabaseConfigured: () => true, supabaseAdmin: () => db },
    '@/siteMaintenance/server': { readMaintenance: async () => config },
  }), saved: () => saved };
}
test('maintenance admin route requires auth for reads and writes; rejects invalid writes', async () => {
  const a = adminRoute(false);
  assert.equal((await a.route.GET({})).status, 401);
  assert.equal((await a.route.PUT({ json: async () => config })).status, 401);
  assert.equal(a.saved(), undefined);
  const b = adminRoute();
  assert.equal((await b.route.PUT({ json: async () => ({ ...config, enabled: 'true' }) })).status, 400);
  assert.equal(b.saved(), undefined);
  assert.equal((await b.route.PUT({ json: async () => config })).status, 200);
  assert.equal(b.saved().key, 'site_maintenance');
  assert.equal(JSON.parse(b.saved().value).enabled, true);
  assert.equal((await b.route.PUT({ json: async () => ({ ...config, enabled: false }) })).status, 200);
  assert.equal(JSON.parse(b.saved().value).enabled, false);
});
test('middleware blocks business APIs and rewrites nested pages with 503; errors stay closed', async () => {
  const { NextRequest } = require('next/server');
  let state = config;
  let reads = 0;
  const { middleware } = loadSource('src/middleware.ts', { '@/siteMaintenance/server': { readMaintenance: async () => { reads++; if (state instanceof Error) throw state; return state; } } });
  const call = (path, method = 'GET') => middleware(new NextRequest('http://localhost' + path, { method }));
  assert.equal((await call('/admin/login')).status, 200);
  assert.equal(reads, 0);
  const page = await call('/shop/123?foo=bar');
  assert.equal(page.status, 503);
  assert.match(page.headers.get('x-middleware-rewrite'), /\/maintenance$/);
  assert.match(page.headers.get('cache-control'), /no-store/);
  assert.equal((await call('/api/orders', 'POST')).status, 503);
  state = new Error('fixture-db-secret');
  const failed = await call('/api/orders');
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /fixture-db-secret/);
  state = { ...config, enabled: false };
  assert.equal((await call('/shop/123')).status, 200);
});
test('maintenance document sets real HTTP 503 and only redirects after manual opening', async () => {
  let state = config;
  const { getServerSideProps } = loadSource('src/pages/maintenance.tsx', { '@/siteMaintenance/server': { readMaintenance: async () => state } });
  const res = { setHeader() {} };
  const closed = await getServerSideProps({ res });
  assert.equal(res.statusCode, 503);
  assert.equal(closed.props.config.enabled, true);
  state = { ...config, deadline: '2020-01-01T00:00:00Z' };
  assert.equal((await getServerSideProps({ res })).props.config.enabled, true);
  state = { ...config, enabled: false };
  assert.equal((await getServerSideProps({ res })).redirect.destination, '/');
});
test('only a valid signed admin session can keep backend business API access during closure', async () => {
  const { verifyMaintenanceAdmin } = loadSource('src/siteMaintenance/admin-session.ts');
  const { createHmac } = require('node:crypto');
  const key = 'local-fixture-key';
  const exp = String(Date.now() + 60000);
  const token = exp + '.' + createHmac('sha256', key).update(exp).digest('hex');
  assert.equal(await verifyMaintenanceAdmin(token, key), true);
  for (const bad of [undefined, 'forged', token + '0', token.replace(exp, '1')]) assert.equal(await verifyMaintenanceAdmin(bad, key), false);
  assert.equal(await verifyMaintenanceAdmin(token, 'wrong-secret'), false);
  assert.equal(await verifyMaintenanceAdmin(token, ''), false);
  const { NextRequest } = require('next/server');
  const previous = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = key;
  try {
    const { middleware } = loadSource('src/middleware.ts', { '@/siteMaintenance/server': { readMaintenance: async () => config } });
    const apiResponse = await middleware(new NextRequest('http://localhost/api/app-settings', { headers: { cookie: `admin_session=${token}` } }));
    assert.equal(apiResponse.status, 200);
    const forged = await middleware(new NextRequest('http://localhost/api/app-settings', { headers: { cookie: 'admin_session=forged' } }));
    assert.equal(forged.status, 503);
    const page = await middleware(new NextRequest('http://localhost/unit/item', { headers: { cookie: `admin_session=${token}` } }));
    assert.equal(page.status, 503);
  } finally { if (previous === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = previous; }
});

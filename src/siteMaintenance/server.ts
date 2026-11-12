import { DEFAULT_MAINTENANCE, MAINTENANCE_KEY, parseMaintenance, type MaintenanceConfig } from './logic';

type ServerEnvironment = { SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string };

/** Server/Edge only. Never import from client code. No cross-request cache. */
export async function readMaintenance(
  env: ServerEnvironment = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY },
  request: typeof fetch = fetch,
): Promise<MaintenanceConfig> {
  if (!env.SUPABASE_URL && !env.SUPABASE_SERVICE_ROLE_KEY) return { ...DEFAULT_MAINTENANCE };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('维护配置暂不可用');
  const url = new URL('/rest/v1/app_settings', env.SUPABASE_URL);
  url.searchParams.set('key', `eq.${MAINTENANCE_KEY}`);
  url.searchParams.set('select', 'value');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await request(url, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      cache: 'no-store', signal: controller.signal,
    });
    if (!response.ok) throw new Error('维护配置暂不可用');
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length > 1) throw new Error('维护配置暂不可用');
    if (rows.length === 0) return { ...DEFAULT_MAINTENANCE };
    return parseMaintenance(JSON.parse(rows[0].value));
  } finally { clearTimeout(timeout); }
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

interface CouponRiskSettings {
  id: 1;
  enabled: boolean;
  window_hours: number;
  device_limit: number;
  ip_limit: number;
  new_account_cooldown_hours: number;
  first_strike_hours: number;
  second_strike_days: number;
  permanent_strikes: number;
  allow_coupon_override: boolean;
  updated_at: string;
}

function boolOf(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function intOf(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const { data, error } = await supabaseAdmin()
    .from('coupon_risk_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('领券风控配置不存在，请先执行 043 迁移', 500);

  return ok(data);
}

export async function PATCH(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  if (!body) return fail('请求体必须为 JSON 对象');

  const { data, error } = await supabaseAdmin()
    .from('coupon_risk_settings')
    .update({
      enabled: boolOf(body.enabled, true),
      window_hours: intOf(body.window_hours, 1, 720, 24),
      device_limit: intOf(body.device_limit, 1, 1000, 1),
      ip_limit: intOf(body.ip_limit, 1, 1000, 2),
      new_account_cooldown_hours: intOf(body.new_account_cooldown_hours, 0, 720, 0),
      first_strike_hours: intOf(body.first_strike_hours, 1, 720, 24),
      second_strike_days: intOf(body.second_strike_days, 1, 60, 7),
      permanent_strikes: intOf(body.permanent_strikes, 2, 10, 3),
      allow_coupon_override: boolOf(body.allow_coupon_override, false),
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select()
    .single();
  if (error) return fail(`领券风控保存失败：${error.message}`, 500);

  return ok(data as CouponRiskSettings);
}

import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { maskTail } from '@/lib/format';
import type { UserEntitlement } from '@/lib/types';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

const DAY_MS = 24 * 3600 * 1000;

/** 列表行：权益 + 计算态 + 来源码掩码 */
interface EntitlementRow extends UserEntitlement {
  /** 实时状态：permanent 永久 / active 生效中 / expired 已过期 */
  status: 'permanent' | 'active' | 'expired';
  /** 剩余天数（永久/过期为 null） */
  remaining_days: number | null;
  /** 来源卡密掩码（无关联码为 null） */
  source_code: string | null;
}

/**
 * GET /api/entitlements — 用户权益列表（管理端，HMAC cookie 鉴权）
 * 可选 query：kind=daily_plan|content 过滤。
 * 每行附带实时状态（permanent/active/expired）、剩余天数、来源卡密掩码。
 */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const kindParam = req.nextUrl.searchParams.get('kind');
  const db = supabaseAdmin();
  try {
    let query = db
      .from('user_entitlements')
      .select('*')
      .order('unlocked_at', { ascending: false })
      .limit(1000);
    if (kindParam === 'daily_plan' || kindParam === 'content') {
      query = query.eq('kind', kindParam);
    }
    const { data, error } = await query;
    if (error) return fail(error.message, 500);
    const ents = (data ?? []) as UserEntitlement[];

    // 批量取来源卡密内容做掩码（避免 N+1）
    const keyIds = Array.from(
      new Set(ents.map((e) => e.card_key_id).filter((v): v is string => Boolean(v))),
    );
    const codeByKeyId = new Map<string, string>();
    if (keyIds.length > 0) {
      const { data: keys, error: keysErr } = await db
        .from('card_keys')
        .select('id, content')
        .in('id', keyIds);
      if (keysErr) return fail(keysErr.message, 500);
      for (const k of (keys ?? []) as Array<{ id: string; content: string }>) {
        codeByKeyId.set(k.id, maskTail(k.content));
      }
    }

    const now = Date.now();
    const rows: EntitlementRow[] = ents.map((e) => {
      let status: EntitlementRow['status'];
      let remaining: number | null = null;
      if (e.expires_at === null) {
        status = 'permanent';
      } else {
        const exp = Date.parse(e.expires_at);
        if (Number.isNaN(exp)) {
          status = 'permanent';
        } else if (exp <= now) {
          status = 'expired';
          remaining = 0;
        } else {
          status = 'active';
          remaining = Math.ceil((exp - now) / DAY_MS);
        }
      }
      return {
        ...e,
        status,
        remaining_days: remaining,
        source_code: e.card_key_id ? codeByKeyId.get(e.card_key_id) ?? null : null,
      };
    });

    return ok(rows);
  } catch (e) {
    return fail(e instanceof Error ? e.message : '查询失败', 500);
  }
}

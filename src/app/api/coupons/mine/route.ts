import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/api';
import { getRequestUser } from '@/lib/user-auth';
import { couponStateOf } from '@/lib/coupons-server';
import type { Coupon, CouponClaim, CouponState } from '@/lib/coupon-types';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 我的券状态：可用 / 未开始 / 已用于订单（占用中）/ 已使用 / 已过期 / 已停用 */
export type MyCouponStatus =
  | 'available'
  | 'not_started'
  | 'locked'
  | 'used'
  | 'expired'
  | 'disabled';

export interface MyCoupon {
  claim: Pick<CouponClaim, 'id' | 'code' | 'claimed_at' | 'used_at' | 'order_id'>;
  coupon: Pick<
    Coupon,
    | 'id'
    | 'name'
    | 'type'
    | 'value'
    | 'min_amount'
    | 'valid_from'
    | 'valid_to'
    | 'activity_id'
    | 'total_qty'
  >;
  status: MyCouponStatus;
  /** 这张券**全站**已领数（判「已领完」用） */
  claimed_count: number;
  /** 还剩多少张（null = 不限量） */
  remaining: number | null;
}

/**
 * 券状态判定。
 * ⚠️ `claimedCount` 必须是**真实**的全站领取数 —— 原来这里硬编码 0，
 * 导致「已领完」永远判不出来（2026-09-24 修）。
 * ⚠️ `sold_out` 刻意映射成 `available`：**别人领完了不影响我手上这张**，
 * 券已经在我这儿了，照旧能用。
 */
function statusOf(
  coupon: Coupon,
  claim: Pick<CouponClaim, 'used_at' | 'order_id'>,
  claimedCount: number,
): MyCouponStatus {
  if (claim.used_at) return 'used';
  if (claim.order_id) return 'locked';
  const state: CouponState = couponStateOf(coupon, claimedCount);
  if (state === 'expired') return 'expired';
  if (state === 'disabled') return 'disabled';
  // 还没到生效时间：不能算「可使用」（结算时会被服务端拒），单列一档
  if (state === 'not_started') return 'not_started';
  return 'available';
}

/**
 * GET /api/coupons/mine — 我领取的优惠券（登录用户，Bearer 鉴权）
 *
 * 返回全部领取记录（含已使用 / 已过期）+ 券模板信息，按领取时间倒序。
 * 用户拿到专属码后在这里随时回看（结账时复制粘贴）。
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const user = await getRequestUser(req);
  if (!user) return fail('请先登录', 401);

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('coupon_claims')
    .select('id, code, claimed_at, used_at, order_id, coupons(*)')
    .eq('user_id', user.id)
    .order('claimed_at', { ascending: false });
  if (error) return fail(error.message, 500);

  const raw = (data ?? []) as Array<{
    id: string;
    code: string;
    claimed_at: string;
    used_at: string | null;
    order_id: string | null;
    coupons: Coupon | Coupon[] | null;
  }>;

  // 每张券的**全站领取数**（判「已领完」）。批量查一次在内存里分组，
  // 不要按券逐个查（N+1）。取数失败不影响主流程 —— 退化成"判不出已领完"，
  // 总比整个「我的券」打不开强。
  const couponIds = Array.from(
    new Set(
      raw
        .map((r) => {
          const c = Array.isArray(r.coupons) ? r.coupons[0] : r.coupons;
          return c?.id ?? '';
        })
        .filter(Boolean),
    ),
  );
  const claimedByCoupon = new Map<string, number>();
  if (couponIds.length > 0) {
    const { data: claimRows } = await db
      .from('coupon_claims')
      .select('coupon_id')
      .in('coupon_id', couponIds);
    for (const r of claimRows ?? []) {
      const id = (r as { coupon_id: string }).coupon_id;
      claimedByCoupon.set(id, (claimedByCoupon.get(id) ?? 0) + 1);
    }
  }

  const items: MyCoupon[] = [];
  for (const row of raw) {
    const coupon = (Array.isArray(row.coupons) ? row.coupons[0] : row.coupons) as Coupon | null;
    if (!coupon) continue; // 券被删除（活动删除级联）后残留的领券记录：忽略
    const claim = {
      id: row.id,
      code: row.code,
      claimed_at: row.claimed_at,
      used_at: row.used_at,
      order_id: row.order_id,
    };
    const claimed = claimedByCoupon.get(coupon.id) ?? 0;
    items.push({
      claim,
      coupon: {
        id: coupon.id,
        name: coupon.name,
        type: coupon.type,
        value: coupon.value,
        min_amount: coupon.min_amount,
        valid_from: coupon.valid_from,
        valid_to: coupon.valid_to,
        activity_id: coupon.activity_id,
        total_qty: coupon.total_qty,
      },
      status: statusOf(coupon, claim, claimed),
      claimed_count: claimed,
      remaining:
        coupon.total_qty === null
          ? null
          : Math.max(0, Number(coupon.total_qty) - claimed),
    });
  }

  return ok({ items });
}

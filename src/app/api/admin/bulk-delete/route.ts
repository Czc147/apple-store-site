import type { NextRequest } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { ok, fail, parseBody } from '@/lib/api';
import { checkAdmin } from '@/lib/auth';
import { collectKeyIdsToVoid, voidKeys } from '@/lib/entitlements-server';

export const dynamic = 'force-dynamic';

const UNCONFIGURED_MSG =
  'SUPABASE_NOT_CONFIGURED：请先配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';

/** 单次批量操作上限（后端逐个核对状态，避免超大请求拖垮函数） */
const MAX_BULK = 200;

/** 允许批量的资源（订单不开放删除：财务痕迹，维持只能取消） */
const OPS = {
  community_posts: ['delete'],
  community_comments: ['delete'],
  card_keys: ['delete', 'void'],
  daily_picks: ['delete'],
  subscription_products: ['delete'],
  activities: ['delete'],
  major_units: ['delete'],
  sub_units: ['delete'],
  entitlements: ['revoke'],
} as const;

type Resource = keyof typeof OPS;
type Op = 'delete' | 'void' | 'revoke';

interface Failure {
  id: string;
  error: string;
}

/**
 * POST /api/admin/bulk-delete — 后台批量删除 / 作废 / 撤销（需管理员）
 *
 * 请求体：{ resource: <白名单键>, op?: 'delete'|'void'|'revoke', ids: string[] }
 *
 * 为什么是一个统一端点：各板块的删除语义各不相同（卡密要判状态、权益要先作废
 * 卡密再删行、大单元要清首页板块的悬空引用），逐个写 8 套「批量」路由只会把
 * 这些规则复制 8 遍；这里用白名单 + 每个资源自己的执行函数，规则只有一份。
 * 单条删除路由照旧保留（前端行内删除走它们，行为不变）。
 *
 * 部分成功语义：逐条/分组合法性判定，返回 { deleted, voided, failed: [{id, error}] }，
 * 只要请求本身合法就回 200（前端按 failed 展示明细）。
 *
 * 级联说明（DB 触发器/外键，批量与单条一致）：
 * - community_posts：评论与点赞一并删除
 * - community_comments：无级联（删它的父帖会连带删除）
 * - major_units：其下小单元级联删除，并清理首页板块里指向它们的悬空 id
 * - sub_units / activities / subscription 目标：触发器 handle_sellable_deleted 自动禁用关联卡密商品
 * - entitlements：先作废关联卡密（防旧码重放复活）再删权益行
 */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return fail('未登录或登录已过期', 401);
  if (!isSupabaseConfigured()) return fail(UNCONFIGURED_MSG, 503);

  const body = await parseBody(req);
  const resource = typeof body?.resource === 'string' ? (body.resource as Resource) : null;
  if (!resource || !(resource in OPS)) {
    return fail(`resource 必须是 ${Object.keys(OPS).join(' / ')} 之一`);
  }

  const allowedOps = OPS[resource] as readonly Op[];
  const op = (typeof body?.op === 'string' ? body.op : allowedOps[0]) as Op;
  if (!allowedOps.includes(op)) {
    return fail(`${resource} 支持的操作：${allowedOps.join(' / ')}`);
  }

  const rawIds = Array.isArray(body?.ids) ? body.ids : [];
  const ids = [
    ...new Set(
      rawIds.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim()),
    ),
  ];
  if (ids.length === 0) return fail('请选择要操作的条目');
  if (ids.length > MAX_BULK) return fail(`单次最多处理 ${MAX_BULK} 条，本次 ${ids.length} 条`);

  const db = supabaseAdmin();
  const failed: Failure[] = [];
  let deleted = 0;
  let voided = 0;

  try {
    if (resource === 'card_keys') {
      const { data, error } = await db.from('card_keys').select('id, status').in('id', ids);
      if (error) return fail(error.message, 500);
      const rows = (data ?? []) as Array<{ id: string; status: string }>;
      const found = new Map(rows.map((r) => [r.id, r.status]));
      for (const id of ids) if (!found.has(id)) failed.push({ id, error: '卡密不存在' });

      if (op === 'void') {
        // 作废：未使用 / 已发放 → 已作废（保留订单关联，与单条作废口径一致）
        const target = rows.filter((r) => r.status === 'unused' || r.status === 'issued').map((r) => r.id);
        for (const r of rows) {
          if (r.status === 'void') failed.push({ id: r.id, error: '该卡密已是作废状态' });
        }
        if (target.length > 0) {
          const { data: updated, error: updErr } = await db
            .from('card_keys')
            .update({ status: 'void' })
            .in('id', target)
            .select('id');
          if (updErr) return fail(updErr.message, 500);
          voided = (updated ?? []).length;
        }
      } else {
        // 删除：已发放的码不能删（买家手里可能还没兑换），提示改用作废
        const target = rows.filter((r) => r.status !== 'issued').map((r) => r.id);
        for (const r of rows) {
          if (r.status === 'issued') {
            failed.push({ id: r.id, error: '已发放的卡密不能删除，请改用「批量作废」' });
          }
        }
        if (target.length > 0) {
          const { data: done, error: delErr } = await db.from('card_keys').delete().in('id', target).select('id');
          if (delErr) return fail(delErr.message, 500);
          deleted = (done ?? []).length;
        }
      }
    } else if (resource === 'entitlements') {
      // 撤销：逐条先作废关联卡密（口径同单条撤销），再删权益行
      for (const id of ids) {
        const { data, error } = await db
          .from('user_entitlements')
          .select('id, user_id, kind, card_key_id')
          .eq('id', id)
          .maybeSingle();
        if (error) return fail(error.message, 500);
        const row = data as { id: string; user_id: string; kind: string; card_key_id: string | null } | null;
        if (!row) {
          failed.push({ id, error: '权益不存在' });
          continue;
        }
        try {
          const keyIds = await collectKeyIdsToVoid(db, row);
          await voidKeys(db, keyIds);
          voided += keyIds.length;
        } catch (e) {
          failed.push({ id, error: e instanceof Error ? e.message : '作废卡密失败' });
          continue;
        }
        const { error: delErr } = await db.from('user_entitlements').delete().eq('id', id);
        if (delErr) {
          failed.push({ id, error: delErr.message });
          continue;
        }
        deleted += 1;
      }
    } else {
      const table = resource;
      const { data, error } = await db.from(table).delete().in('id', ids).select('id');
      if (error) return fail(error.message, 500);
      const doneIds = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
      deleted = doneIds.length;
      const doneSet = new Set(doneIds);
      for (const id of ids) if (!doneSet.has(id)) failed.push({ id, error: '条目不存在或已被删除' });

      // 大单元：顺带清理首页板块数组里的悬空 id（历史缝隙，单条删除路径未处理）
      if (resource === 'major_units' && doneIds.length > 0) {
        const { data: sections, error: secErr } = await db
          .from('home_sections')
          .select('id, major_unit_ids');
        if (secErr) return fail(secErr.message, 500);
        for (const s of (sections ?? []) as Array<{ id: string; major_unit_ids: string[] | null }>) {
          const list = s.major_unit_ids ?? [];
          const next = list.filter((mid) => !doneSet.has(mid));
          if (next.length !== list.length) {
            const { error: updErr } = await db
              .from('home_sections')
              .update({ major_unit_ids: next })
              .eq('id', s.id);
            if (updErr) return fail(updErr.message, 500);
          }
        }
      }
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : '批量操作失败', 500);
  }

  return ok({ requested: ids.length, deleted, voided, failed });
}

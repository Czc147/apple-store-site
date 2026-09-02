/**
 * 卡密商品「关联目标」（小单元 / 活动 / 订阅）的服务端解析工具。
 * 多态关联无物理外键，目标的存在性校验与名称解析集中在这里，
 * 供 card-management 各路由与兑换接口复用。
 *
 * ⚠️ 仅供服务端（route handler）import，严禁出现在客户端代码。
 */
import { supabaseAdmin } from './supabase/admin';
import { TARGET_TYPE, type CardProduct, type CardTargetType } from './card-types';

/** 目标类型 → 对应表名 */
const TABLE_BY_TYPE: Record<CardTargetType, string> = {
  [TARGET_TYPE.SUB_UNIT]: 'sub_units',
  [TARGET_TYPE.ACTIVITY]: 'activities',
  [TARGET_TYPE.SUBSCRIPTION]: 'subscriptions',
};

/** 列表接口附加的关联名称 */
export interface TargetInfo {
  /** 目标展示名：小单元名 / 活动标题（回退描述首行）/ 订阅名 */
  target_name: string | null;
  /** 分组名：目前仅小单元附带其大单元名，其余为 null */
  group_name: string | null;
}

/** 入参只需要这三个字段（products 裸表行或其子集均可） */
type Targeted = Pick<CardProduct, 'id' | 'target_type' | 'target_id'>;

/** 活动展示名：优先 title，回退 description 首行 */
function activityName(title: string | null, description: string | null): string {
  if (title && title.trim()) return title.trim();
  const firstLine = description?.split(/\r?\n/).find((l) => l.trim());
  return firstLine?.trim() || '未命名活动';
}

/**
 * 批量解析关联目标名称：返回 卡密商品 id → { target_name, group_name }。
 * 按目标类型分组后最多 4 次并行查询（三类目标 + 大单元名）。
 */
export async function resolveTargetNames(products: Targeted[]): Promise<Map<string, TargetInfo>> {
  const result = new Map<string, TargetInfo>();
  const ids: Record<CardTargetType, string[]> = { sub_unit: [], activity: [], subscription: [] };
  for (const p of products) {
    if (!p.target_type || !p.target_id) continue;
    if (!ids[p.target_type].includes(p.target_id)) ids[p.target_type].push(p.target_id);
  }

  const db = supabaseAdmin();
  const [subsRes, majorsRes, actsRes, plansRes] = await Promise.all([
    ids.sub_unit.length
      ? db.from('sub_units').select('id, name, major_unit_id').in('id', ids.sub_unit)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    ids.sub_unit.length
      ? db.from('major_units').select('id, name')
      : Promise.resolve({ data: [] as unknown[], error: null }),
    ids.activity.length
      ? db.from('activities').select('id, title, description').in('id', ids.activity)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    ids.subscription.length
      ? db.from('subscriptions').select('id, name').in('id', ids.subscription)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  if (subsRes.error) throw new Error(subsRes.error.message);
  if (majorsRes.error) throw new Error(majorsRes.error.message);
  if (actsRes.error) throw new Error(actsRes.error.message);
  if (plansRes.error) throw new Error(plansRes.error.message);

  const majorNameById = new Map<string, string>();
  for (const m of majorsRes.data as Array<{ id: string; name: string }>) {
    majorNameById.set(m.id, m.name);
  }
  const subInfoById = new Map<string, { name: string; groupName: string | null }>();
  for (const s of subsRes.data as Array<{ id: string; name: string; major_unit_id: string }>) {
    subInfoById.set(s.id, { name: s.name, groupName: majorNameById.get(s.major_unit_id) ?? null });
  }
  const actNameById = new Map<string, string>();
  for (const a of actsRes.data as Array<{ id: string; title: string | null; description: string | null }>) {
    actNameById.set(a.id, activityName(a.title, a.description));
  }
  const planNameById = new Map<string, string>();
  for (const s of plansRes.data as Array<{ id: string; name: string }>) {
    planNameById.set(s.id, s.name);
  }

  for (const p of products) {
    if (!p.target_type || !p.target_id) continue;
    if (p.target_type === TARGET_TYPE.SUB_UNIT) {
      const info = subInfoById.get(p.target_id);
      result.set(p.id, { target_name: info?.name ?? null, group_name: info?.groupName ?? null });
    } else if (p.target_type === TARGET_TYPE.ACTIVITY) {
      result.set(p.id, { target_name: actNameById.get(p.target_id) ?? null, group_name: null });
    } else {
      result.set(p.id, { target_name: planNameById.get(p.target_id) ?? null, group_name: null });
    }
  }
  return result;
}

/** 创建 / 编辑卡密商品时校验目标行存在（多态关联无外键，必须显式校验） */
export async function targetExists(targetType: CardTargetType, targetId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from(TABLE_BY_TYPE[targetType])
    .select('id')
    .eq('id', targetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** 兑换接口用：按目标类型读取展示名 + 兑换商品内容（目标不存在返回 null） */
export async function resolveTargetContent(
  targetType: CardTargetType,
  targetId: string,
): Promise<{ name: string; redeem_image_url: string | null } | null> {
  const db = supabaseAdmin();
  if (targetType === TARGET_TYPE.SUB_UNIT) {
    const { data, error } = await db
      .from('sub_units')
      .select('name, redeem_image_url')
      .eq('id', targetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { name: data.name, redeem_image_url: data.redeem_image_url } : null;
  }
  if (targetType === TARGET_TYPE.ACTIVITY) {
    const { data, error } = await db
      .from('activities')
      .select('title, description, redeem_image_url')
      .eq('id', targetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data
      ? { name: activityName(data.title, data.description), redeem_image_url: data.redeem_image_url }
      : null;
  }
  const { data, error } = await db
    .from('subscriptions')
    .select('name, redeem_image_url')
    .eq('id', targetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { name: data.name, redeem_image_url: data.redeem_image_url } : null;
}

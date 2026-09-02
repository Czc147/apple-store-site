/**
 * 发卡管理后台前端共享类型与工具。
 * 后端列表接口会为记录附加关联名称（商品→关联目标、卡密/登记→商品描述），
 * 这里与 lib/card-types.ts 的裸表类型区分开。
 */
import type { CardDelivery, CardKey, CardKeyStats, CardProduct } from '@/lib/card-types';

/** 卡密商品 + 列表接口附加字段（GET /api/card-management/products） */
export interface CardProductRow extends CardProduct {
  /** 关联目标名称（小单元名 / 活动标题 / 订阅名）；目标被删除后为 null */
  target_name: string | null;
  /** 目标所属分组名（目前仅小单元有大单元名，其余为 null） */
  group_name: string | null;
  /** 仅 include_stats=1 时返回 */
  stats?: CardKeyStats;
}

/** 卡密 + 列表接口附加字段（GET /api/card-management/keys） */
export interface CardKeyRow extends CardKey {
  description: string | null;
  target_name: string | null;
}

/** 取卡登记 + 列表接口附加字段（GET /api/card-management/deliveries） */
export interface CardDeliveryRow extends CardDelivery {
  description: string | null;
  target_name: string | null;
}

/** 下拉选项中的商品展示文案：优先关联目标名，其次描述 */
export function productLabel(p: Pick<CardProductRow, 'target_name' | 'description'>): string {
  return p.target_name ?? p.description ?? '未命名商品';
}

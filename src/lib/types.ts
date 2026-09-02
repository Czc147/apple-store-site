/** 数据库表类型（与 supabase/schema.sql 对应） */

/** 大单元（分组） */
export interface MajorUnit {
  id: string;
  name: string;
  image_url: string | null;
  link_url: string | null;
  sort_order: number;
  created_at: string;
}

/** 小单元（挂在某个大单元下） */
export interface SubUnit {
  id: string;
  major_unit_id: string;
  name: string;
  sort_order: number;
  price: number;
  payment_url: string | null;
  /** 兑换商品：不公开，买家输入卡密兑换成功后弹出（图片 / 视频 / 文档） */
  redeem_image_url: string | null;
  created_at: string;
}

/** 活动 */
export interface Activity {
  id: string;
  /** 活动标题（叠加在卡片大图上；旧数据可能为 null，前端回退到 description 首行） */
  title: string | null;
  image_url: string | null;
  description: string | null;
  link_url: string | null;
  /** 兑换商品：不公开，买家输入卡密兑换成功后弹出（与公开卡片图 image_url 无关） */
  redeem_image_url: string | null;
  sort_order: number;
  created_at: string;
}

/** 订阅 */
export interface Subscription {
  id: string;
  name: string;
  price: number;
  duration: string | null;
  /** 详细介绍：前台订阅卡片点击弹层展示 */
  description: string | null;
  payment_url: string | null;
  /** 兑换商品：不公开，买家输入卡密兑换成功后弹出（图片 / 视频 / 文档） */
  redeem_image_url: string | null;
  sort_order: number;
  created_at: string;
}

/** 发卡管理模块（卡密商品 / 卡密 / 取卡登记单）类型统一在 card-types.ts，
 *  此处再导出保持「类型单一入口」的既有约定 */
export * from './card-types';

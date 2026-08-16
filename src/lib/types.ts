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
  sort_order: number;
  created_at: string;
}

/** 订阅 */
export interface Subscription {
  id: string;
  name: string;
  price: number;
  duration: string | null;
  payment_url: string | null;
  sort_order: number;
  created_at: string;
}

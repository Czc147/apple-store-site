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

/** 每日推荐（与迁移 005 的 daily_picks 对应）：一天一条；封面公开、内容文件在私有桶 */
export interface DailyPick {
  id: string;
  /** 更新日期 'YYYY-MM-DD'（唯一，管理员指定；「今日」以北京时区比对） */
  pick_date: string;
  title: string;
  /** 介绍：解锁后可见 */
  description: string | null;
  /** 封面图（公开 images 桶，未解锁可见的营销 teaser） */
  cover_url: string | null;
  /** 内容文件在私有桶 daily 的对象路径；前台不暴露，服务端现签 1h 链接 */
  media_path: string | null;
  /** 跳转链接（可选，如外部视频地址） */
  link_url: string | null;
  created_at: string;
  updated_at: string;
}

/** 每日推荐前台 teaser（未解锁也可见；不含任何私有内容字段） */
export interface DailyPickTeaser {
  pick_date: string;
  title: string;
  cover_url: string | null;
  /** 是否有正文内容（媒体文件或跳转链接） */
  has_content: boolean;
}

/** 后台 daily-picks 列表接口返回行：附带现签的内容预览链接（仅后台用，禁止入库/前台） */
export interface DailyPickAdminRow extends DailyPick {
  media_preview_url: string | null;
}

/** 用户权益类型（与迁移 005 的 user_entitlements.kind 一致） */
export const ENTITLEMENT_KIND = {
  /** 每日计划解锁：每用户单条，重复兑换叠加延期 */
  DAILY_PLAN: 'daily_plan',
  /** 兑换内容：每码一条，带商品快照 */
  CONTENT: 'content',
} as const;

export type EntitlementKind =
  (typeof ENTITLEMENT_KIND)[keyof typeof ENTITLEMENT_KIND];

/** 用户权益（「我的库」数据源） */
export interface UserEntitlement {
  id: string;
  user_id: string;
  /** 邮箱快照（后台列表展示用） */
  user_email: string | null;
  kind: EntitlementKind;
  card_key_id: string | null;
  /* ---- content 类快照字段（防目标删除/改动后丢内容） ---- */
  name: string | null;
  description: string | null;
  media_url: string | null;
  target_type: string | null;
  target_id: string | null;
  /** 获得时间 */
  unlocked_at: string;
  /** 到期时间；null = 永久 */
  expires_at: string | null;
  source: 'redeem' | 'sync' | 'admin';
}

/** 发卡管理模块（卡密商品 / 卡密 / 取卡登记单）类型统一在 card-types.ts，
 *  此处再导出保持「类型单一入口」的既有约定 */
export * from './card-types';

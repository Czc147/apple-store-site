/** 数据库表类型（与 supabase/schema.sql 对应） */

/** 大单元（分组） */
export interface MajorUnit {
  id: string;
  name: string;
  image_url: string | null;
  link_url: string | null;
  sort_order: number;
  created_at: string;
  /** 卡片名称下的副标题（为空时前台回退「N 个可选内容」） */
  subtitle?: string | null;
  /** 无图时的底色 / 渐变（hex 或 CSS 渐变串） */
  cover_color?: string | null;
  /** 卡片左上角小图标（emoji 或图片 URL） */
  app_icon?: string | null;
  /** 精选标记：首页「精选」板块只展示勾选的卡片 */
  featured?: boolean;
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

/** 订阅类型（与迁移 008 的 subscriptions.type 对应） */
export const SUBSCRIPTION_TYPE = {
  /** 普通订阅：兑换内容 */
  NORMAL: 'normal',
  /** 每日计划：解锁每日推荐 */
  DAILY_PLAN: 'daily_plan',
} as const;

export type SubscriptionType =
  (typeof SUBSCRIPTION_TYPE)[keyof typeof SUBSCRIPTION_TYPE];

export const SUBSCRIPTION_TYPE_LABEL: Record<SubscriptionType, string> = {
  normal: '普通订阅',
  daily_plan: '每日计划',
};

/** 订阅 */
export interface Subscription {
  id: string;
  name: string;
  price: number;
  duration: string | null;
  /** 详细介绍：前台订阅卡片点击弹层展示 */
  description: string | null;
  payment_url: string | null;
  /** 跳转链接：前台订阅卡片弹层的「了解更多」入口（选填） */
  link_url: string | null;
  /** 兑换商品：不公开，买家输入卡密兑换成功后弹出（图片 / 视频 / 文档） */
  redeem_image_url: string | null;
  /** 订阅类型：normal 普通订阅 / daily_plan 每日计划（旧数据默认 normal） */
  type?: SubscriptionType;
  /** 每日计划解锁有效天数（仅 daily_plan 有意义）；null = 永久 */
  unlock_duration_days?: number | null;
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
  /** Hero 封面上的 tagline（未解锁也可见） */
  subtitle?: string | null;
  /** Hero 无图占位的渐变主色 */
  accent_color?: string | null;
  created_at: string;
  updated_at: string;
}

/** 每日推荐前台 teaser（未解锁也可见；不含任何私有内容字段） */
export interface DailyPickTeaser {
  pick_date: string;
  title: string;
  cover_url: string | null;
  /** Hero 封面上的 tagline（未解锁也可见） */
  subtitle?: string | null;
  /** Hero 无图占位的渐变主色 */
  accent_color?: string | null;
  /** 是否有正文内容（媒体文件或跳转链接） */
  has_content: boolean;
}

/** 后台 daily-picks 列表接口返回行：附带现签的内容预览链接（仅后台用，禁止入库/前台） */
export interface DailyPickAdminRow extends DailyPick {
  media_preview_url: string | null;
}

/** 用户权益类型（与迁移 005 / 013 的 user_entitlements.kind 一致） */
export const ENTITLEMENT_KIND = {
  /** 每日计划解锁：每用户单条，重复兑换叠加延期 */
  DAILY_PLAN: 'daily_plan',
  /** 兑换内容：每码一条，带商品快照 */
  CONTENT: 'content',
  /** 订阅解锁：每用户每订阅单条，重复解锁叠加有效期（迁移 013） */
  SUBSCRIPTION: 'subscription',
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
  /** 订阅权益指向 subscriptions.id；kind='subscription' 时非空 */
  subscription_id: string | null;
  /** 内容文件在私有桶的对象路径（订阅仓库商品 media_path 等） */
  media_path: string | null;
  /** 获得时间 */
  unlocked_at: string;
  /** 到期时间；null = 永久 */
  expires_at: string | null;
  source: 'redeem' | 'sync' | 'admin' | 'order';
}

/** 订阅仓库·订阅商品（与迁移 011 的 subscription_products 对应） */
export interface SubscriptionProduct {
  id: string;
  /** 所属订阅 id */
  subscription_id: string;
  title: string;
  /** 介绍（解锁后可见） */
  description: string | null;
  /** 封面图（公开 images 桶，未解锁也可见的营销 teaser） */
  cover_url: string | null;
  /** 内容文件在私有桶 daily 的对象路径；服务端现签 1h 链接 */
  media_path: string | null;
  /** 跳转链接（可选） */
  link_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 后台订阅仓库商品列表行：附带现签的内容预览链接（仅后台用） */
export interface SubscriptionProductAdminRow extends SubscriptionProduct {
  media_preview_url: string | null;
}

/** 通知（与迁移 014 的 notifications 对应） */
export interface Notification {
  id: string;
  user_id: string;
  title: string | null;
  body: string | null;
  payload: Record<string, unknown> | null;
  /** 已读时刻；null = 未读 */
  read_at: string | null;
  created_at: string;
}

/** 首页板块（与迁移 006 的 home_sections 对应）：一段「标题 + 卡片流」 */
export interface HomeSection {
  id: string;
  title: string;
  subtitle: string | null;
  /** carousel 横向滚动吸附 / grid 两列网格 */
  layout: 'carousel' | 'grid';
  /** true=只显示打了「精选」标记的大单元（仅在未显式选大单元时生效） */
  featured_only: boolean;
  /** 显式选入的大单元 id 列表（按此顺序渲染）；为空则回退 featured_only / 全部 */
  major_unit_ids: string[];
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 全局配置（与迁移 006 的 app_settings 对应）：key-value，值可能为空串 */
export interface AppSettings {
  site_title?: string;
  home_greeting?: string;
  home_subtitle?: string;
  announcement?: string;
  /** 微信收款码图 URL（结算弹窗展示；个人扫码收款） */
  payment_wechat_qr_url?: string;
  /** 支付宝收款码图 URL（结算弹窗展示；个人扫码收款） */
  payment_alipay_qr_url?: string;
  [key: string]: string | undefined;
}

/** 发卡管理模块（卡密商品 / 卡密 / 取卡登记单）类型统一在 card-types.ts，
 *  此处再导出保持「类型单一入口」的既有约定 */
export * from './card-types';

/**
 * 发卡管理模块类型定义（与 supabase/migrations/002_card_management.sql 对应）
 * 通过 lib/types.ts 统一再导出（export * from './card-types'）。
 */

/* ----------------------------------------------------------
   卡密状态与动作
   ---------------------------------------------------------- */

/** 卡密状态值（与数据库 check 约束保持一致） */
export const CARD_KEY_STATUS = {
  /** 未使用：在库，可被发放 */
  UNUSED: 'unused',
  /** 已发放：已随订单发给买家 */
  ISSUED: 'issued',
  /** 已作废：手动作废，不参与发放 */
  VOID: 'void',
} as const;

export type CardKeyStatus = (typeof CARD_KEY_STATUS)[keyof typeof CARD_KEY_STATUS];

/** 状态中文文案（后台界面用） */
export const CARD_KEY_STATUS_LABEL: Record<CardKeyStatus, string> = {
  unused: '未使用',
  issued: '已发放',
  void: '已作废',
};

/** 卡密状态变更动作（PUT /api/card-management/keys/:id/status 的 action 取值） */
export const CARD_KEY_ACTIONS = ['void', 'restore', 'reissue'] as const;
export type CardKeyAction = (typeof CARD_KEY_ACTIONS)[number];

/* ----------------------------------------------------------
   取卡登记单状态
   ---------------------------------------------------------- */

/** 取卡登记单状态值 */
export const CARD_DELIVERY_STATUS = {
  /** 待取卡：已登记，买家尚未取卡 */
  PENDING: 'pending',
  /** 已发放：买家已成功取卡 */
  FULFILLED: 'fulfilled',
  /** 已取消：管理员取消登记 */
  CANCELLED: 'cancelled',
} as const;

export type CardDeliveryStatus =
  (typeof CARD_DELIVERY_STATUS)[keyof typeof CARD_DELIVERY_STATUS];

/** 状态中文文案（后台界面用） */
export const CARD_DELIVERY_STATUS_LABEL: Record<CardDeliveryStatus, string> = {
  pending: '待取卡',
  fulfilled: '已发放',
  cancelled: '已取消',
};

/* ----------------------------------------------------------
   卡密商品的关联目标（多态：小单元 / 活动 / 订阅）
   ---------------------------------------------------------- */

/** 关联目标类型值（与数据库 check 约束保持一致） */
export const TARGET_TYPE = {
  SUB_UNIT: 'sub_unit',
  ACTIVITY: 'activity',
  SUBSCRIPTION: 'subscription',
} as const;

export type CardTargetType = (typeof TARGET_TYPE)[keyof typeof TARGET_TYPE];

/** 合法的目标类型取值列表（校验外部输入用；`in TARGET_TYPE` 判断的是键名，勿用） */
export const TARGET_TYPE_VALUES: CardTargetType[] = Object.values(TARGET_TYPE);

/** 目标类型中文文案（后台界面用） */
export const TARGET_TYPE_LABEL: Record<CardTargetType, string> = {
  sub_unit: '小单元',
  activity: '活动',
  subscription: '订阅',
};

/* ----------------------------------------------------------
   兑换类型（迁移 005：content 兑换内容 / unlock_daily 解锁每日计划）
   ---------------------------------------------------------- */

/** 兑换类型值（与数据库 check 约束保持一致） */
export const REDEEM_TYPE = {
  /** 兑换内容（现有行为）：核销后展示兑换商品（图片 / 视频 / 文档） */
  CONTENT: 'content',
  /** 解锁每日计划（新）：核销后解锁「每日推荐」，有效期由后台决定 */
  UNLOCK_DAILY: 'unlock_daily',
} as const;

export type RedeemType = (typeof REDEEM_TYPE)[keyof typeof REDEEM_TYPE];

/** 合法的兑换类型取值列表（校验外部输入用） */
export const REDEEM_TYPE_VALUES: RedeemType[] = Object.values(REDEEM_TYPE);

/** 兑换类型中文文案（后台界面用） */
export const REDEEM_TYPE_LABEL: Record<RedeemType, string> = {
  content: '兑换内容',
  unlock_daily: '解锁每日计划',
};

/* ----------------------------------------------------------
   表类型
   ---------------------------------------------------------- */

/** 卡密商品（多态关联至小单元 / 活动 / 订阅） */
export interface CardProduct {
  id: string;
  /** 关联目标类型；目标被删除后置 null，商品自动禁用（数据库触发器） */
  target_type: CardTargetType | null;
  /** 关联目标行 id（sub_units / activities / subscriptions，按 target_type 区分） */
  target_id: string | null;
  /** 商品描述（取卡页 / 兑换页可展示给买家） */
  description: string | null;
  /** 兑换类型：content 兑换内容 / unlock_daily 解锁每日计划（迁移 005） */
  redeem_type: RedeemType;
  /** 解锁有效天数（仅 unlock_daily 有意义）：null = 永久；有效期自核销时刻起算 */
  unlock_duration_days: number | null;
  enabled: boolean;
  sort_order: number;
  created_at: string;
}

/** 卡密（库存 + 发放状态一体记录） */
export interface CardKey {
  id: string;
  card_product_id: string;
  /** 卡密内容（明文存储；严禁写入日志或错误上报） */
  content: string;
  status: CardKeyStatus;
  /** 发放后写入的订单号；恢复/重新发放时清空 */
  order_id: string | null;
  issued_at: string | null;
  /** 导入时间，兼作 FIFO 发放顺序 */
  created_at: string;
}

/** 取卡登记单（订单级：幂等键 + 取卡码 + 应发数量） */
export interface CardDelivery {
  id: string;
  /** 订单号，全局唯一（幂等键） */
  order_id: string;
  card_product_id: string;
  /** 应发卡密数量（1–100） */
  quantity: number;
  /** 取卡码：服务端生成的 32 位 hex，与订单号组成双因子验证 */
  claim_token: string;
  status: CardDeliveryStatus;
  /** 买家实际取卡时间 */
  fulfilled_at: string | null;
  /** 登记时间 */
  created_at: string;
}

/** 某商品（或全局）的卡密库存统计 */
export interface CardKeyStats {
  total: number;
  unused: number;
  issued: number;
  void: number;
}

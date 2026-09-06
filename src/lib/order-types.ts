/** 订单模块类型定义（与 supabase/migrations/010_orders.sql 对应） */

/** 订单类型：小单元 / 订阅 */
export const ORDER_TYPE = {
  SUB_UNIT: 'sub_unit',
  SUBSCRIPTION: 'subscription',
} as const;
export type OrderType = (typeof ORDER_TYPE)[keyof typeof ORDER_TYPE];

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  sub_unit: '小单元',
  subscription: '订阅',
};

/** 支付方式：微信 / 支付宝（人工扫码收款） */
export const PAYMENT_METHOD = {
  WECHAT: 'wechat',
  ALIPAY: 'alipay',
} as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  wechat: '微信',
  alipay: '支付宝',
};

/** 订单状态 */
export const ORDER_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  CANCELED: 'canceled',
} as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: '待确认',
  paid: '已确认',
  canceled: '已取消',
};

/** 订单头 */
export interface Order {
  id: string;
  order_no: string;
  user_id: string;
  user_email: string | null;
  total: number | string;
  type: OrderType;
  payment_method: PaymentMethod;
  status: OrderStatus;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 订单行项 */
export interface OrderItem {
  id: string;
  order_id: string;
  line_index: number;
  line_type: OrderType;
  ref_id: string;
  name: string;
  price: number | string;
  quantity: number;
  card_product_id: string | null;
  delivered_at: string | null;
  created_at: string;
}

/** POST /api/orders 入参的行项 */
export interface OrderCreateItem {
  ref_type: OrderType;
  ref_id: string;
  quantity: number;
}

/** POST /api/orders 成功响应 */
export interface CreateOrderResult {
  order_no: string;
  total: number | string;
  type: OrderType;
  payment_method: PaymentMethod;
}

-- ============================================================
-- 迁移 010：订单（个人码收货 + 后台确认派发）
--
-- 业务闭环（替代酷发卡外跳）：
--   用户在前台愿望单/订阅结算 → 选微信/支付宝 → 弹后台配置的收款码 → 扫码付 →
--   「推送订单」→ 本站建 order + order_items（含关联的卡密发卡单）→
--   管理员在「订单管理」确认收款 → 逐行调 deliver_card_keys 派发卡密 →
--   每密钥写入买家仓库（user_entitlements）。
--
-- 幂等：订单创建时按行写 card_deliveries（order_id = "order_no:行号" 唯一），
--       确认 = 逐行 deliver_card_keys(order_id, token)，RPC 自带幂等重放。
--
-- 两表：
--   orders        订单头（type 小单元/订阅；payment_method 微信/支付宝；status）
--   order_items   行项（line_type 小单元/订阅 + ref_id 引目标 + 数量 + 派发结果）
--
-- RLS：enable 且零 policy——全部走本站 API（service_role）。
-- 使用方法：Supabase Dashboard → SQL Editor → 运行本文件（幂等）
-- ============================================================


-- ============================================================
-- 1. orders · 订单头
--    type：sub_unit（愿望单小单元）/ subscription（订阅）
--    payment_method：wechat / alipay（人工扫码收款）
--    status：pending（用户已推，待确认）/ paid（已确认收款）/ canceled
--    paid_at：确认收款时刻
-- ============================================================
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_no       text not null unique,             -- 可读订单号（如 Z202609061314 风格）
  user_id        uuid not null,                    -- 下单账号（必须登录）
  user_email     text,                             -- 邮箱快照（后台展示）
  total          numeric(10,2) not null default 0, -- 合计金额
  type           text not null
                 check (type in ('sub_unit', 'subscription')),
  payment_method text
                 check (payment_method in ('wechat', 'alipay')),
  status         text not null default 'pending'
                 check (status in ('pending', 'paid', 'canceled')),
  paid_at        timestamptz,                      -- 确认收款时刻
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.orders
  is '订单头：type 区分小单元/订阅，payment_method 人工扫码收款，status 待确认/已确认/取消';
comment on column public.orders.type
  is 'sub_unit 愿望单小单元（每行派发 content 权益）/ subscription 订阅（每行派发 subscription 权益）';
comment on column public.orders.status
  is 'pending 用户已推送待管理员确认 / paid 已确认收款并派发 / canceled 已取消';


-- ============================================================
-- 2. order_items · 行项
--    line_type + ref_id 指向具体目标（sub_units.id / subscriptions.id）；
--    card_product_id 下单时解析到对应卡密商品（供确认时派发）；
--    delivered_at 该行派发完成时刻。
-- ============================================================
create table if not exists public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  line_type       text not null
                  check (line_type in ('sub_unit', 'subscription')),
  ref_id          uuid not null,                   -- 目标 id（sub_units/subscriptions）
  name            text not null,                   -- 商品名快照
  price           numeric(10,2) not null default 0, -- 单价快照
  quantity        integer not null default 1
                  check (quantity between 1 and 100),
  card_product_id uuid references public.card_products (id),  -- 确认时派发用
  delivered_at    timestamptz,                     -- 该行派发完成时刻
  created_at      timestamptz not null default now()
);

comment on table public.order_items
  is '订单行项：line_type+ref_id 指目标，quantity 数量（1..100），card_product_id 确认派发用';

-- 按订单查行项
create index if not exists idx_order_items_order
  on public.order_items (order_id);


-- ============================================================
-- 3. RLS：两表开启行级安全，不建 policy（同卡密表模式，只走 service_role）。
-- ============================================================
alter table public.orders       enable row level security;
alter table public.order_items  enable row level security;

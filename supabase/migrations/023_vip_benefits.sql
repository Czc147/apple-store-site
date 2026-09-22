-- 023 会员卡与订阅优惠权益（需求1）
--
-- 订阅产品新增三组配置：
--   1. 会员卡样式与卡面文案（用户持有该订阅权益时发一张卡）
--   2. 享受优惠：折扣百分比 + 适用范围 + 生效时间窗
-- 订单新增 discount_source，记录这一单的优惠来自券还是 VIP 折扣
-- （两者不叠加，下单时取更优的一个，见 src/lib/vip-benefits.ts）。
--
-- 折扣百分比口径与既有的 coupons.value 一致：percent 类型存「减掉的百分比」，
-- 即 20 = 打 8 折，前端文案是「减 20%」。这样计算能直接复用
-- src/lib/coupons-server.ts 的 computeDiscount()，不必再写第二套公式。
--
-- 幂等：可重复执行。

alter table public.subscriptions
  add column if not exists card_style          text,
  add column if not exists card_text           text,
  add column if not exists discount_percent    numeric(5, 2),
  add column if not exists discount_scope      text[],
  add column if not exists discount_valid_from timestamptz,
  add column if not exists discount_valid_to   timestamptz;

alter table public.orders
  add column if not exists discount_source text;

comment on column public.subscriptions.card_style is
  '会员卡样式：null=不发卡 | silver 银 | gold 金 | black 黑金。用户持多个时取最高档';
comment on column public.subscriptions.card_text is
  '会员卡中心的大文本（如「年度会员」）；后台可编辑';
comment on column public.subscriptions.discount_percent is
  'VIP 折扣：减掉的百分比，20 = 打8折（与 coupons.value 同口径）；null = 无优惠';
comment on column public.subscriptions.discount_scope is
  'VIP 折扣适用范围子集：unit 选购页商品 / subscription 订阅套餐；null 或空数组 = 不生效';
comment on column public.subscriptions.discount_valid_from is
  'VIP 折扣生效开始时间；null = 不限';
comment on column public.subscriptions.discount_valid_to is
  'VIP 折扣生效结束时间；null = 不限';
comment on column public.orders.discount_source is
  '本单优惠来源：coupon 优惠券 / vip 订阅折扣 / null 无优惠。两者不叠加，取更优';

-- 约束：PG 不支持 add constraint if not exists，用 drop + add 写成幂等
alter table public.subscriptions drop constraint if exists subscriptions_card_style_check;
alter table public.subscriptions add constraint subscriptions_card_style_check
  check (card_style is null or card_style in ('silver', 'gold', 'black'));

alter table public.subscriptions drop constraint if exists subscriptions_discount_percent_check;
alter table public.subscriptions add constraint subscriptions_discount_percent_check
  check (discount_percent is null or (discount_percent > 0 and discount_percent < 100));

alter table public.subscriptions drop constraint if exists subscriptions_discount_scope_check;
alter table public.subscriptions add constraint subscriptions_discount_scope_check
  check (discount_scope is null or discount_scope <@ array['unit', 'subscription']::text[]);

alter table public.orders drop constraint if exists orders_discount_source_check;
alter table public.orders add constraint orders_discount_source_check
  check (discount_source is null or discount_source in ('coupon', 'vip'));

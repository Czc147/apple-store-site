-- 029 一起买：拼单（探究广场 · 一起买板块）
--
-- 用户需求原文：
--   「用户可以发布一起买订单，功能相当于拼单，比如说选择4个人结算，
--     就是当有四个人加入一起买后每个人付款的价格变成四分之一，
--     等待每个人推送订单后即可付款，选择对应的小单元，选择一起买人数。」
--   到期策略（用户 2026-09-22 拍板）：**到期自动关闭**。
--
-- 价格模型：每人应付 = 小单元原价 ÷ 成团人数。**不进数据库** ——
-- 它是从 sub_units.price 与 target_count 现算的派生值，存下来就会有两个真相，
-- 改价或改人数时必然对不上。下单时在服务端现算并覆盖订单价（见 /api/orders）。
--
-- 到期自动关闭用「读时判定 + 懒清理」而不是定时任务：
-- 本项目没有 cron（与 community 的 7 天清理同一套降级手法），
-- 列表读取时把过期的标掉即可，不需要后台进程常驻。
--
-- 幂等：可重复执行。

create table if not exists public.group_buys (
  id            uuid primary key default gen_random_uuid(),
  initiator_id  uuid not null,
  sub_unit_id   uuid not null,
  -- 成团人数（含发起人）。上限 20：再多就没人愿意等，而且后台人工核收款会崩
  target_count  integer not null check (target_count between 2 and 20),
  status        text not null default 'open'
                check (status in ('open', 'full', 'closed', 'expired')),
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);

-- 列表：还在进行中的团优先
create index if not exists idx_group_buys_status_time
  on public.group_buys (status, created_at desc);
-- 我发起的
create index if not exists idx_group_buys_initiator
  on public.group_buys (initiator_id, created_at desc);

alter table public.group_buys enable row level security;

comment on table public.group_buys is
  '一起买拼单：每人应付 = sub_units.price / target_count（现算，不落库）';

create table if not exists public.group_buy_members (
  id            uuid primary key default gen_random_uuid(),
  group_buy_id  uuid not null references public.group_buys (id) on delete cascade,
  user_id       uuid not null,
  joined_at     timestamptz not null default now(),
  -- 该成员推送订单后记录订单号；null = 还没推送
  order_id      uuid,
  -- 同一人不能在一个团里占两个位
  constraint uq_group_buy_member unique (group_buy_id, user_id)
);

create index if not exists idx_group_buy_members_user
  on public.group_buy_members (user_id, joined_at desc);

alter table public.group_buy_members enable row level security;

comment on table public.group_buy_members is
  '拼单成员：order_id 为空表示还没推送订单（"等待每个人推送订单后即可付款"）';
comment on column public.group_buy_members.order_id is
  '成员推送订单后的订单号；null = 未推送。成团后各自按分摊价推单';

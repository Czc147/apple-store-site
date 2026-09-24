-- 033: 卡券订阅的数据层 —— 券关联表 + 发券溯源
--
-- 「卡券订阅」（subscriptions.type='coupon'，见迁移 032）买的是"卡 + 券"：
--   - **卡**（VIP 会员卡）走现成的 023 机制：card_style / discount_* 配在那条订阅上，
--     买了跟普通订阅一样由 grant_subscription 授予 → 会员卡由「我的券」展示。
--     零新表。
--   - **券**（优惠券）需要一张关联表：这条订阅要发哪几张券。
--
-- 为什么用**关联表**而不是给 coupons 加一列：
--   `coupons.activity_id` 现在是 NOT NULL（迁移 022），改成可空会动到现有券的全部
--   读取路径与 `claim_coupon` RPC；关联表是纯新增，不动任何现有代码。
--   同一张券可以既挂在活动下、又随订阅发放，两条路互不影响。
--
-- `coupon_claims.source_subscription_id`：记「这张券是哪个订阅发的」——
--   既供「我的券」显示来源，也是发券的**幂等键**（见下面的部分唯一索引）。

create table if not exists public.subscription_coupons (
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  coupon_id       uuid not null references public.coupons(id) on delete cascade,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  primary key (subscription_id, coupon_id)
);

comment on table public.subscription_coupons is
  '卡券订阅要发放的券（迁移 033）：订阅被确认收款时按这张表把券发到用户的「我的券」';

alter table public.subscription_coupons enable row level security;

alter table public.coupon_claims
  add column if not exists source_subscription_id uuid
    references public.subscriptions(id) on delete set null;

comment on column public.coupon_claims.source_subscription_id is
  '这张券由哪个卡券订阅发放（迁移 033）；NULL = 用户自己在活动页领取的';

-- 发券幂等：同一个订阅给同一个人、同一张券只发一次。
-- 用**部分**唯一索引，只约束订阅发的那批；用户自助领取的那批 source 为 NULL，不受影响。
create unique index if not exists uq_coupon_claims_from_subscription
  on public.coupon_claims (user_id, coupon_id, source_subscription_id)
  where source_subscription_id is not null;

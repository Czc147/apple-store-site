-- ============================================================
-- 迁移 022：优惠券系统（一码一人领取制 + 全场通用）
--
-- 设计（用户拍板）：
--   一码一人：每张券的每次领取生成一条 coupon_claims（专属码），
--             码只能绑定一个用户，一人一码、不可转赠；
--   全场通用：券不绑定商品，结算时对订单原价生效，带满减门槛 min_amount；
--   两种类型：fixed 满减（value = 减免金额）/ percent 折扣（value = 减免百分比 1–99）。
--
-- 本迁移做四件事：
--   1. coupons       券模板（挂在活动下：活动板块是券的入口）
--   2. coupon_claims 领取记录（专属码 + 生命周期：领取 → 下单占用 → 确认核销）
--   3. orders 加列    coupon_code（用户专属码快照）+ discount_amount（优惠金额）
--      —— orders.total 语义不变（仍是行项原价合计），实付 = total - discount_amount
--   4. RPC claim_coupon(券, 用户, 码)：领券的原子校验 + 写入
--      （行锁 + 限领/余量/有效期判定，避免并发超领）
--
-- 券生命周期：领取（coupon_claims）→ 下单占用（order_id 写入，CAS）→
--   确认收款核销（used_at）／订单取消释放（order_id 置空）。
--   「一单一券」由部分唯一索引 uq_coupon_claims_order 兜底。
--
-- 幂等：create table if not exists / add column if not exists / create or replace。
-- 使用方法：node scripts/apply-migration.mjs supabase/migrations/022_coupons.sql
-- ============================================================

-- ============================================================
-- 1. coupons · 券模板
-- ============================================================
create table if not exists public.coupons (
  id             uuid primary key default gen_random_uuid(),
  activity_id    uuid not null references public.activities (id) on delete cascade,
  name           text not null,
  type           text not null check (type in ('fixed', 'percent')),
  value          numeric(10,2) not null check (value > 0),
  min_amount     numeric(10,2) not null default 0 check (min_amount >= 0),
  valid_from     timestamptz,
  valid_to       timestamptz,
  total_qty      integer check (total_qty is null or total_qty > 0),
  per_user_limit integer not null default 1 check (per_user_limit >= 1),
  enabled        boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists idx_coupons_activity
  on public.coupons (activity_id);

comment on table public.coupons
  is '优惠券模板：挂在活动下，一码一人领取；type fixed 满减 / percent 折扣（减免百分比）';
comment on column public.coupons.value
  is 'fixed = 减免金额（元）；percent = 减免百分比（1-99，如 20 表示减 20%）';
comment on column public.coupons.min_amount
  is '用券门槛：订单原价需 ≥ 该金额，0 = 无门槛';
comment on column public.coupons.total_qty
  is '总张数（领取上限）；null = 不限量';
comment on column public.coupons.per_user_limit
  is '每人限领张数（默认 1）';


-- ============================================================
-- 2. coupon_claims · 领取记录（一码一人）
-- ============================================================
create table if not exists public.coupon_claims (
  id         uuid primary key default gen_random_uuid(),
  coupon_id  uuid not null references public.coupons (id) on delete cascade,
  user_id    uuid not null,
  code       text not null unique,
  claimed_at timestamptz not null default now(),
  used_at    timestamptz,
  order_id   uuid references public.orders (id) on delete set null
);

create index if not exists idx_coupon_claims_coupon_user
  on public.coupon_claims (coupon_id, user_id);
create index if not exists idx_coupon_claims_user
  on public.coupon_claims (user_id);

-- 一单一券：一个订单最多占用一张券（pending 占用；取消时释放为 null）
create unique index if not exists uq_coupon_claims_order
  on public.coupon_claims (order_id)
  where order_id is not null;

comment on table public.coupon_claims
  is '优惠券领取记录：每人每次领取生成一条专属码（一码一人，不可转赠）';
comment on column public.coupon_claims.order_id
  is '占用该券的订单（下单锁券）：pending 期间占用防双花，取消释放、确认核销写 used_at';
comment on column public.coupon_claims.used_at
  is '核销时刻（后台确认收款时写入）；非空 = 已使用，不可再用于其它订单';


-- ============================================================
-- 3. orders · 券快照与优惠金额
--    total 语义不变（行项原价合计），实付 = total - discount_amount
-- ============================================================
alter table public.orders
  add column if not exists coupon_code text;
alter table public.orders
  add column if not exists discount_amount numeric(10,2) not null default 0;

comment on column public.orders.coupon_code
  is '本单使用的优惠券专属码快照（coupon_claims.code）；无券为 null';
comment on column public.orders.discount_amount
  is '优惠金额（元）：实付 = total - discount_amount；无券为 0';


-- ============================================================
-- 4. RLS：零 policy（与卡密/权益/订单一一致，只走 service_role API）
-- ============================================================
alter table public.coupons        enable row level security;
alter table public.coupon_claims  enable row level security;


-- ============================================================
-- 5. RPC claim_coupon(券, 用户, 码) · 领券的原子校验 + 写入
--    行锁券模板串行化同一张券的并发领取，逐项判定：
--    启用 / 生效时间窗 / 余量 / 每人限领 —— 任一不过抛错由调用方映射文案。
-- ============================================================
create or replace function public.claim_coupon(
  p_coupon_id uuid,
  p_user_id   uuid,
  p_code      text
)
returns public.coupon_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon  public.coupons;
  v_claimed integer;
  v_mine    integer;
  v_claim   public.coupon_claims;
begin
  -- 行锁：同一张券的并发领取串行执行（余量判定后不会超发）
  select * into v_coupon from public.coupons where id = p_coupon_id for update;
  if not found then raise exception 'COUPON_NOT_FOUND'; end if;
  if not v_coupon.enabled then raise exception 'COUPON_DISABLED'; end if;
  if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
    raise exception 'COUPON_NOT_STARTED';
  end if;
  if v_coupon.valid_to is not null and now() > v_coupon.valid_to then
    raise exception 'COUPON_EXPIRED';
  end if;

  select count(*) into v_claimed from public.coupon_claims where coupon_id = p_coupon_id;
  if v_coupon.total_qty is not null and v_claimed >= v_coupon.total_qty then
    raise exception 'COUPON_SOLD_OUT';
  end if;

  select count(*) into v_mine
    from public.coupon_claims
   where coupon_id = p_coupon_id and user_id = p_user_id;
  if v_mine >= v_coupon.per_user_limit then
    raise exception 'COUPON_LIMIT_REACHED';
  end if;

  insert into public.coupon_claims (coupon_id, user_id, code)
  values (p_coupon_id, p_user_id, p_code)
  returning * into v_claim;

  return v_claim;
end;
$$;

revoke execute on function public.claim_coupon(uuid, uuid, text) from public, anon;
grant execute on function public.claim_coupon(uuid, uuid, text) to service_role;

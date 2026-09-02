-- ============================================================
-- 迁移 002：发卡管理模块
-- 功能：后台自建发卡系统——管理员录入卡密库存，买家凭
--       「订单号 + 取卡码」经前台接口自助取卡（原子 + 幂等发放）。
--
-- 新增三张表：
--   1. card_products   卡密商品（与 sub_units 1:1 关联）
--   2. card_keys       卡密库存（发放状态直接记录在本表）
--   3. card_deliveries 取卡登记单（订单级：幂等键 + 取卡码 + 数量）
--
-- 安全模型：三张表开启 RLS 且【不建任何 policy】——匿名端零读取、
--   零写入；与现有四张「公开只读」业务表不同，卡密是资产，
--   所有访问一律通过本站 API（service_role）。
--
-- 使用方法：Supabase Dashboard → SQL Editor → 运行本文件
--           （全部语句幂等，可重复执行）
-- ============================================================

-- 0. 扩展：gen_random_uuid() 需要（新项目一般已默认开启）
create extension if not exists "pgcrypto";


-- ============================================================
-- 1. card_products · 卡密商品
--    一个 sub_unit 至多关联一个卡密商品（unique）。
--    sub_unit 被删除时外键 SET NULL 保留本行（保住其下卡密与
--    发货历史），并由触发器（见第 4 节）自动置为禁用。
-- ============================================================
create table if not exists public.card_products (
  id           uuid primary key default gen_random_uuid(),
  sub_unit_id  uuid unique
               references public.sub_units (id) on delete set null,
  description  text,                          -- 商品描述（取卡页可展示给买家）
  enabled      boolean not null default true, -- 启用/禁用（禁用后不可登记/取卡）
  sort_order   integer not null default 0,    -- 排序，越小越靠前
  created_at   timestamptz not null default now()
);

comment on table public.card_products
  is '卡密商品：与 sub_units 1:1 关联；sub_unit 删除时 SET NULL 并自动禁用';


-- ============================================================
-- 2. card_keys · 卡密库存（发放状态一体记录，不另建发货表）
--    状态机：
--      unused ──发放──> issued ──重新发放(售后)──> unused
--      unused/issued ──作废──> void ──恢复──> unused
--    order_id / issued_at 在发放时写入；恢复/重新发放时清空。
-- ============================================================
create table if not exists public.card_keys (
  id               uuid primary key default gen_random_uuid(),
  card_product_id  uuid not null
                   references public.card_products (id) on delete restrict,
  content          text not null,              -- 卡密内容（明文存储，严禁写入日志）
  status           text not null default 'unused'
                   check (status in ('unused', 'issued', 'void')),
  order_id         text,                       -- 发放后写入的订单号
  issued_at        timestamptz,                -- 发放时间
  created_at       timestamptz not null default now(), -- 导入时间，兼作 FIFO 顺序
  unique (card_product_id, content)            -- 同商品下卡密不重复（导入去重兜底）
);

comment on column public.card_keys.status
  is 'unused 未使用 / issued 已发放 / void 已作废';
comment on column public.card_keys.order_id
  is '发放后写入；恢复或重新发放（售后补发）时清空';

-- 高频查询 1：某商品剩余库存 + FIFO 取卡（发放 RPC 使用）
create index if not exists idx_card_keys_fifo
  on public.card_keys (card_product_id, created_at, id)
  where status = 'unused';

-- 高频查询 2：库存统计 / 按「商品 + 状态」筛选列表
create index if not exists idx_card_keys_product_status
  on public.card_keys (card_product_id, status);

-- 高频查询 3：按订单号查发放记录（幂等校验、发货记录页）
create index if not exists idx_card_keys_order
  on public.card_keys (order_id)
  where order_id is not null;


-- ============================================================
-- 3. card_deliveries · 取卡登记单
--    订单级信息：幂等键（order_id 全局唯一）、取卡码（32 位 hex，
--    服务端生成，防订单号枚举）、应发数量。
--    「发货记录」= card_keys 中 status='issued' 的行；本表保留
--    订单维度历史（某订单何时登记/发放了什么商品、多少张）。
-- ============================================================
create table if not exists public.card_deliveries (
  id               uuid primary key default gen_random_uuid(),
  order_id         text not null unique,      -- 订单号全局唯一（幂等键）
  card_product_id  uuid not null
                   references public.card_products (id) on delete restrict,
  quantity         integer not null default 1
                   check (quantity between 1 and 100), -- 一单发几张卡
  claim_token      text not null,             -- 取卡码：服务端生成 32 位 hex
  status           text not null default 'pending'
                   check (status in ('pending', 'fulfilled', 'cancelled')),
  fulfilled_at     timestamptz,               -- 买家实际取卡时间
  created_at       timestamptz not null default now() -- 登记时间
);

comment on column public.card_deliveries.status
  is 'pending 待取卡 / fulfilled 已发放 / cancelled 已取消';
comment on column public.card_deliveries.claim_token
  is '取卡码，取卡时与订单号组成双因子验证；仅在后台与取卡接口间流转';

-- 后台按商品 / 按登记时间筛选
create index if not exists idx_card_deliveries_product
  on public.card_deliveries (card_product_id);
create index if not exists idx_card_deliveries_created
  on public.card_deliveries (created_at desc);


-- ============================================================
-- 4. 触发器：sub_unit 删除 → 自动禁用关联的卡密商品
--    放在数据库层（而非改 API）：从 Supabase 控制台手删、
--    或将来新增其它删除入口时同样生效，不可绕过。
-- ============================================================
create or replace function public.handle_sub_unit_deleted()
returns trigger
language plpgsql
as $$
begin
  update public.card_products
     set enabled = false
   where sub_unit_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_sub_unit_deleted on public.sub_units;
create trigger trg_sub_unit_deleted
  after delete on public.sub_units
  for each row execute function public.handle_sub_unit_deleted();


-- ============================================================
-- 5. 发放 RPC：deliver_card_keys(订单号, 取卡码)
--    在单个事务内完成：
--      ① 行锁锁定登记单（同一订单并发请求串行化）
--      ② 校验取卡码 / 登记状态；已发放 → 幂等返回原卡密
--      ③ 校验商品启用
--      ④ FIFO + FOR UPDATE SKIP LOCKED 原子取卡发放（防超发）
--    任何异常都会回滚整个事务，不会出现「半发放」。
--    异常标识（API 层按 message 映射 HTTP 状态）：
--      DELIVERY_NOT_FOUND / TOKEN_MISMATCH / DELIVERY_CANCELLED /
--      KEYS_REISSUED / PRODUCT_DISABLED / INSUFFICIENT_STOCK
-- ============================================================
create or replace function public.deliver_card_keys(
  p_order_id    text,
  p_claim_token text
)
returns setof public.card_keys
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery  public.card_deliveries%rowtype;
  v_enabled   boolean;
  v_issued    integer;
  v_remaining integer;
begin
  -- ① 行锁锁定登记单：同一订单的并发取卡请求在此串行化
  select * into v_delivery
    from public.card_deliveries
   where order_id = p_order_id
   for update;

  if not found then
    raise exception 'DELIVERY_NOT_FOUND';
  end if;
  if v_delivery.claim_token is distinct from p_claim_token then
    raise exception 'TOKEN_MISMATCH';
  end if;
  if v_delivery.status = 'cancelled' then
    raise exception 'DELIVERY_CANCELLED';
  end if;

  -- ② 幂等：已发放且有效卡完整 → 原样返回（重复请求结果一致）
  if v_delivery.status = 'fulfilled' then
    select count(*) into v_remaining
      from public.card_keys
     where order_id = p_order_id and status = 'issued';
    if v_remaining = v_delivery.quantity then
      return query
        select * from public.card_keys
         where order_id = p_order_id and status = 'issued'
         order by created_at, id;
      return;
    end if;
    -- 已发放但有效卡不足应发数量：发生过售后「重新发放 / 作废」等调整，
    -- 不再自助返回部分卡密（数量不符会误导买家），统一引导联系客服
    raise exception 'KEYS_REISSUED';
  end if;

  -- ③ 商品可用性校验（禁用 / 已删除关联的商品不允许发卡）
  select enabled into v_enabled
    from public.card_products
   where id = v_delivery.card_product_id;
  if not found then
    raise exception 'PRODUCT_DISABLED';
  end if;
  if not v_enabled then
    raise exception 'PRODUCT_DISABLED';
  end if;

  -- ④ FIFO 取卡（先入先发）+ 行锁跳过并发占用，一次性发放
  with picked as (
    select id
      from public.card_keys
     where card_product_id = v_delivery.card_product_id
       and status = 'unused'
     order by created_at, id
     limit v_delivery.quantity
     for update skip locked
  )
  update public.card_keys ck
     set status    = 'issued',
         order_id  = p_order_id,
         issued_at = now()
    from picked
   where ck.id = picked.id;

  get diagnostics v_issued = row_count;
  if v_issued < v_delivery.quantity then
    -- 库存不足（含并发抢卡）：回滚整个事务，登记单保持 pending
    raise exception 'INSUFFICIENT_STOCK';
  end if;

  update public.card_deliveries
     set status = 'fulfilled', fulfilled_at = now()
   where id = v_delivery.id;

  return query
    select * from public.card_keys
     where order_id = p_order_id and status = 'issued'
     order by created_at, id;
end;
$$;

-- 仅服务端 service_role 可调用；匿名 / 公开角色一律拒绝
revoke execute on function public.deliver_card_keys(text, text) from public, anon;
grant execute on function public.deliver_card_keys(text, text) to service_role;


-- ============================================================
-- 6. RLS：三张表开启行级安全，且【不创建任何 policy】
--    → 匿名端零读取、零写入；所有访问走本站 API（service_role
--      绕过 RLS）。卡密是资产，切勿添加公开读 policy。
-- ============================================================
alter table public.card_products   enable row level security;
alter table public.card_keys       enable row level security;
alter table public.card_deliveries enable row level security;

-- ============================================================
-- 迁移 003：兑换模块 + 卡密商品多态化
--
-- 业务闭环：
--   买家在第三方发卡平台（链动小铺）付款 → 平台发卡密 →
--   管理员把卡密搬运到本站「卡密库存」→ 买家在首页「兑换」板块
--   输入卡密 → 弹出该商品后台预先存入的【兑换图片】。
--
-- 本迁移做三件事：
--   1. 小单元 / 活动 / 订阅 三张商品表各加一列 redeem_image_url
--      （兑换图片，不公开；仅兑换接口校验通过后返回）
--   2. card_products 从 sub_unit_id 1:1 关联改造为多态关联
--      (target_type + target_id)，使卡密可挂到三类商品
--   3. 「目标被删除 → 自动禁用卡密商品」触发器由 sub_units
--      一张表扩展到三张表
--
-- 使用方法：Supabase Dashboard → SQL Editor → 运行本文件
--           （全部语句幂等，可重复执行）
-- ============================================================


-- ============================================================
-- 1. 兑换图片列（三张商品表）
--    不公开：前台任何列表 / 详情页都不查询该列，
--    只有 /api/redeem 校验卡密成功后才随响应返回。
-- ============================================================
alter table public.sub_units     add column if not exists redeem_image_url text;
alter table public.activities    add column if not exists redeem_image_url text;
alter table public.subscriptions add column if not exists redeem_image_url text;

comment on column public.sub_units.redeem_image_url
  is '兑换图片：不公开，买家输入卡密兑换成功后弹出';
comment on column public.activities.redeem_image_url
  is '兑换图片：不公开，买家输入卡密兑换成功后弹出（与公开卡片图 image_url 无关）';
comment on column public.subscriptions.redeem_image_url
  is '兑换图片：不公开，买家输入卡密兑换成功后弹出';


-- ============================================================
-- 2. card_products 多态化
--    target_type ∈ ('sub_unit','activity','subscription')
--    target_id   指向对应表的行（无物理外键——多态关联无法建
--                跨表 FK，由 API 层校验存在性 + 删除触发器兜底）
--    两列均可空：兼容「目标被删除」的孤儿商品（旧 FK 即 SET NULL
--    语义，由第 3 节触发器置空），孤儿行仍可保留卡密与发货历史。
-- ============================================================
alter table public.card_products add column if not exists target_type text;
alter table public.card_products add column if not exists target_id   uuid;

-- 具名 check 约束。注意：add column if not exists 在列已存在时
-- 整句跳过（不会补建列级约束），所以约束必须单独判存补建。
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'card_products_target_type_check') then
    alter table public.card_products add constraint card_products_target_type_check
      check (target_type is null or target_type in ('sub_unit', 'activity', 'subscription'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'card_products_target_pair_check') then
    alter table public.card_products add constraint card_products_target_pair_check
      check ((target_type is null) = (target_id is null));  -- 两列同生共死
  end if;
end $$;

-- 回填：旧的 sub_unit_id 迁移到多态列（仅列尚存时执行，保证幂等）
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'card_products'
       and column_name = 'sub_unit_id'
  ) then
    update public.card_products
       set target_type = 'sub_unit',
           target_id   = sub_unit_id
     where sub_unit_id is not null
       and target_id is null;
  end if;
end $$;

-- 一个目标至多关联一个卡密商品。
-- NULL 值在唯一索引中互不冲突，孤儿行（两列皆空）可多条共存。
create unique index if not exists uq_card_products_target
  on public.card_products (target_type, target_id);

comment on table public.card_products
  is '卡密商品：多态关联（target_type + target_id）至小单元/活动/订阅；目标被删除时自动禁用并断开关联';


-- ============================================================
-- 3. 触发器换代：先拆旧 → 删旧列 → 建新
--    顺序不可乱：旧函数体引用 sub_unit_id 列，必须先拆。
-- ============================================================

-- 3.1 拆掉 002 的旧触发器与旧函数
drop trigger if exists trg_sub_unit_deleted on public.sub_units;
drop function if exists public.handle_sub_unit_deleted();

-- 3.2 删旧列（自动带走旧外键与旧 unique 索引）
alter table public.card_products drop column if exists sub_unit_id;

-- 3.3 通用触发器函数：目标行被删除 → 关联卡密商品禁用 + 断开关联
--     放在数据库层：控制台手删、将来新增删除入口同样生效，不可绕过
create or replace function public.handle_sellable_deleted()
returns trigger
language plpgsql
as $$
begin
  update public.card_products
     set enabled     = false,
         target_type = null,
         target_id   = null
   where target_type = tg_argv[0]
     and target_id   = old.id;
  return old;
end;
$$;

drop trigger if exists trg_sub_unit_deleted on public.sub_units;
create trigger trg_sub_unit_deleted
  after delete on public.sub_units
  for each row execute function public.handle_sellable_deleted('sub_unit');

drop trigger if exists trg_activity_deleted on public.activities;
create trigger trg_activity_deleted
  after delete on public.activities
  for each row execute function public.handle_sellable_deleted('activity');

drop trigger if exists trg_subscription_deleted on public.subscriptions;
create trigger trg_subscription_deleted
  after delete on public.subscriptions
  for each row execute function public.handle_sellable_deleted('subscription');

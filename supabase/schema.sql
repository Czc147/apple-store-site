-- ============================================================
-- Apple Store 风格商城 · Supabase 数据库初始化脚本
-- 使用方法：Supabase Dashboard → SQL Editor → New query
--          粘贴本文件全部内容 → Run
-- ============================================================

-- 0. 扩展：gen_random_uuid() 需要 pgcrypto（新项目一般已默认开启）
create extension if not exists "pgcrypto";


-- ============================================================
-- 1. major_units · 大单元（分组）
-- ============================================================
create table if not exists public.major_units (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                -- 单元名称
  image_url   text,                         -- 展示图片（Storage 公共 URL）
  link_url    text,                         -- 点击跳转链接
  sort_order  integer not null default 0,   -- 排序，越小越靠前
  created_at  timestamptz not null default now()
);

create index if not exists idx_major_units_sort
  on public.major_units (sort_order);


-- ============================================================
-- 2. sub_units · 小单元（挂在某个大单元下）
-- ============================================================
create table if not exists public.sub_units (
  id             uuid primary key default gen_random_uuid(),
  major_unit_id  uuid not null
                 references public.major_units (id) on delete cascade,
  name           text not null,                          -- 小单元名称
  sort_order     integer not null default 0,             -- 排序
  price          numeric(10,2) not null default 0,       -- 价格（元）
  payment_url    text,                                   -- 付款链接
  created_at     timestamptz not null default now()
);

create index if not exists idx_sub_units_major
  on public.sub_units (major_unit_id);
create index if not exists idx_sub_units_sort
  on public.sub_units (sort_order);


-- ============================================================
-- 3. activities · 活动
-- ============================================================
create table if not exists public.activities (
  id           uuid primary key default gen_random_uuid(),
  title        text,                        -- 活动标题（叠加在卡片大图上）
  image_url    text,                        -- 活动卡片图片
  description  text,                        -- 活动介绍
  link_url     text,                        -- 跳转链接
  sort_order   integer not null default 0,  -- 排序
  created_at   timestamptz not null default now()
);

comment on column public.activities.title
  is '活动标题，白色粗体叠加在卡片图片上；旧数据为空时前端回退到 description 首行';

create index if not exists idx_activities_sort
  on public.activities (sort_order);


-- ============================================================
-- 4. subscriptions · 订阅
-- ============================================================
create table if not exists public.subscriptions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                            -- 订阅名称
  price        numeric(10,2) not null default 0,         -- 价格（元）
  duration     text,                                     -- 订阅时长，自由文本：'1个月' / '1年'
  payment_url  text,                                     -- 付款链接
  sort_order   integer not null default 0,               -- 排序
  created_at   timestamptz not null default now()
);

comment on column public.subscriptions.duration
  is '订阅时长，自由文本，例如「1个月」「连续包年」';

create index if not exists idx_subscriptions_sort
  on public.subscriptions (sort_order);


-- ============================================================
-- 5. RLS 行级安全
-- 策略：所有人可读（前台展示）；写入不开放任何 policy，
--       只允许 service_role（即本站 API Routes）绕过 RLS 写入。
-- ============================================================
alter table public.major_units   enable row level security;
alter table public.sub_units     enable row level security;
alter table public.activities    enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "public: read major_units"   on public.major_units;
drop policy if exists "public: read sub_units"     on public.sub_units;
drop policy if exists "public: read activities"    on public.activities;
drop policy if exists "public: read subscriptions" on public.subscriptions;

create policy "public: read major_units"
  on public.major_units for select using (true);
create policy "public: read sub_units"
  on public.sub_units for select using (true);
create policy "public: read activities"
  on public.activities for select using (true);
create policy "public: read subscriptions"
  on public.subscriptions for select using (true);


-- ============================================================
-- 6. Storage · images 公开图桶
-- 读取：公开（商品图/活动图直接 <img> 引用）
-- 上传：不开放 anon policy，仅服务端 service_role 通过
--       POST /api/upload 上传（见 src/app/api/upload/route.ts）
-- ============================================================
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do update set public = true;

drop policy if exists "public: read images" on storage.objects;
create policy "public: read images"
  on storage.objects for select
  using (bucket_id = 'images');

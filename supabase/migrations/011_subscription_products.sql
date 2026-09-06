-- ============================================================
-- 迁移 011：订阅仓库 · 订阅商品（替代「每日推荐」内容的容器）
--
-- 需求：后台「每日推荐」改造成「订阅仓库」。每个订阅（订阅管理创建）下可挂
-- 一组「订阅商品」；管理员可改某订阅的商品；新增商品后，已解锁该订阅的
-- 用户仓库自动可见（订阅权益 join 本表，无需逐用户复制）。
--
-- 区别 sub_units：sub_units 是公开目录/结算项（自带 RLS/价格/结算语义）；
-- 订阅商品是**私有的付费内容**（媒体文件存私有桶）+ 封面 teaser，两套边界干净。
--
-- 列：
--   subscription_id  外键 → subscriptions（删除订阅即删其商品）
--   cover_url        公开 images 桶 te告封面（未解锁也可见）
--   media_path       私有 daily 桶对象路径（永不落签名 URL，服务端现签）
--   link_url         可选外部跳转
--   sort_order       展示顺序
--
-- RLS：enable 且零 policy——只走 service_role（同 daily_picks）。
-- 使用方法：Supabase Dashboard → SQL Editor → 运行本文件（幂等）
-- ============================================================
create table if not exists public.subscription_products (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  title           text not null,                   -- 商品标题（解锁后可见）
  description     text,                            -- 介绍（解锁后可见）
  cover_url       text,                            -- 封面图（公开桶 teaser）
  media_path      text,                            -- 内容文件路径（私有桶 daily）
  link_url        text,                            -- 跳转链接（可选）
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 按订阅查商品（按排序值）
create index if not exists idx_subscription_products_sub
  on public.subscription_products (subscription_id, sort_order);

comment on table public.subscription_products
  is '订阅仓库·订阅商品：某订阅下的私有付费内容；解锁该订阅的用户仓库自动可见';
comment on column public.subscription_products.media_path
  is '内容文件在私有桶 daily 的对象路径；签名 URL 由服务端现签，禁止入库';
comment on column public.subscription_products.cover_url
  is '封面图：存公开 images 桶，未解锁也可见（营销 teaser）';

-- RLS 零 policy
alter table public.subscription_products enable row level security;

-- ============================================================
-- 迁移 017：用户资料（头像 + 昵称）+ 后台按邮箱查用户 RPC
--
-- 需求：注册即分配随机默认头像（几何渐变 SVG，前端 lib/avatars.ts
-- 渲染，本表只存 key）+ 邮箱前缀默认昵称；用户可在「我的库」自助改。
-- 社区帖子/评论展示头像昵称时实时 join 本表（改名后历史帖同步更新，
-- 不走快照）。
--
-- 两件事：
--   1. profiles 表 + 注册触发器（on_auth_user_created）+ 存量用户回填
--   2. admin_find_user_by_email RPC（后台推送服务按邮箱定位 user_id，
--      auth.users 不经 PostgREST 暴露，必须走 security definer 函数）
--
-- RLS：enable 且【不建 policy】——与 community/entitlements 同模式，
-- 读写全部走本站 API（service_role 绕过 RLS）。
-- 使用方法：Supabase Dashboard → SQL Editor → 运行本文件（幂等，可重复执行）
-- ============================================================


-- ============================================================
-- 1. profiles · 一用户一行
-- ============================================================
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_key   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles
  is '用户资料：display_name（昵称）+ avatar_key（对应 lib/avatars.ts 预置渐变头像 key）';

alter table public.profiles enable row level security;


-- ============================================================
-- 2. 注册触发器：新用户自动建档（随机头像 + 邮箱前缀昵称）
--    预置 key 列表须与 src/lib/avatars.ts 的 AVATAR_PRESETS 保持一致
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  presets text[] := array[
    'aurora','citrus','mint','coral','indigo','sunset',
    'sky','rose','sand','forest','lilac','steel'
  ];
begin
  insert into public.profiles (user_id, display_name, avatar_key)
  values (
    new.id,
    coalesce(nullif(split_part(new.email, '@', 1), ''), '用户'),
    presets[1 + floor(random() * array_length(presets, 1))::int]
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- 3. 回填：迁移前已存在的用户补建默认资料行
-- ============================================================
insert into public.profiles (user_id, display_name, avatar_key)
select
  u.id,
  coalesce(nullif(split_part(u.email, '@', 1), ''), '用户'),
  (array[
    'aurora','citrus','mint','coral','indigo','sunset',
    'sky','rose','sand','forest','lilac','steel'
  ])[1 + floor(random() * 12)::int]
from auth.users u
where not exists (select 1 from public.profiles p where p.user_id = u.id);


-- ============================================================
-- 4. admin_find_user_by_email · 后台推送服务按邮箱定位用户
--    auth.users 不经 PostgREST 暴露，只能通过 security definer 函数间接查询；
--    仅 service_role 可执行（与 grant_subscription 等 RPC 同权限模式）。
-- ============================================================
create or replace function public.admin_find_user_by_email(p_email text)
returns table (id uuid, email text)
language sql
security definer
set search_path = public
as $$
  select u.id, u.email
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.admin_find_user_by_email(text) from public;
grant execute on function public.admin_find_user_by_email(text) to service_role;

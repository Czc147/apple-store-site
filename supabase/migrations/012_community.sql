-- ============================================================
-- 迁移 012：社区（帖子 + 评论 + 点赞）
--
-- 前台「社区」Tab：管理员可发布置顶通知；注册用户只发文本帖，
-- 帖子可点赞、可评论；7 天前的普通帖被懒清理（见 /api/community GET）。
--
-- 三张表：
--   community_posts        帖子（user_id 无物理外键，用户删除不牵连）
--   community_comments     评论（post_id 外键 cascade：删帖即删评论）
--   community_post_likes   点赞（post_id 外键 cascade + unique(post_id,user_id) 防重复）
--
-- RLS：enable 且【不建 policy】——匿名端零访问，前台读走公开 /api/community，
-- 写入一律服务端 service_role（同卡密/权益表模式）。
-- 使用方法：Supabase Dashboard → SQL Editor → 运行本文件（幂等，可重复执行）
-- ============================================================


-- ============================================================
-- 1. community_posts · 帖子
--    只允许纯文本（content）；is_pinned 真=置顶（管理员发布的通知）。
-- ============================================================
create table if not exists public.community_posts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid,                              -- auth.users.id（管理员置顶通知为 null）
  user_email text,                              -- 邮箱冗余快照（发帖时写入）
  content    text not null,                     -- 纯文本正文（前台做长度/空白校验）
  is_pinned  boolean not null default false,    -- 置顶（管理员通知用）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 列表常用序：置顶优先，其余按时间倒序
create index if not exists idx_community_posts_list
  on public.community_posts (is_pinned desc, created_at desc);

comment on table public.community_posts
  is '社区帖子：纯文本；is_pinned 真=置顶通知（管理员）；7 天前普通帖被懒清理';


-- ============================================================
-- 2. community_comments · 评论（post_id 级联删除）
-- ============================================================
create table if not exists public.community_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  user_id    uuid not null,
  user_email text,
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_community_comments_post
  on public.community_comments (post_id, created_at);

comment on table public.community_comments
  is '社区评论：post_id 外键 cascade（删帖即删评论）';


-- ============================================================
-- 3. community_post_likes · 点赞（post_id 级联删除 + 用户去重）
-- ============================================================
create table if not exists public.community_post_likes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  constraint uq_community_like unique (post_id, user_id)
);

create index if not exists idx_community_likes_post
  on public.community_post_likes (post_id);

comment on table public.community_post_likes
  is '社区点赞：unique(post_id,user_id) 防重复；post_id 级联删除';


-- ============================================================
-- 4. RLS：三表开启行级安全，不建 policy → 匿名端零访问，
--    读写全部走本站 API（service_role 绕过 RLS）。
-- ============================================================
alter table public.community_posts        enable row level security;
alter table public.community_comments     enable row level security;
alter table public.community_post_likes   enable row level security;

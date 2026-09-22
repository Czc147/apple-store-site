-- 027 帖子收藏（对话里的「我的收藏」）+ 举报
--
-- 用户 2026-09-22 需求（来自 UI.docx「Premium Social Feed」计划）：
--   收藏的帖子要出现在「对话」里，成一列「我的收藏」，以聊天气泡的形式呈现；
--   并且**能给自己写备注** —— 做成真正的「和自己对话」。
--
-- 设计：收藏不是"一张书签表"，而是**一个人和自己的消息流**。
-- 所以只有一张表，靠 post_id 是否为空区分两种条目：
--   post_id 有值 → 收藏的帖子（气泡里渲染帖子卡）
--   post_id 为空 → 自己写的一句话（纯文本气泡）
-- 两者按 created_at 排成一条时间线 —— 这正是"对话"的语义。
-- 拆成两张表再在前端归并的话，分页、排序、未读数都要各写一遍。
--
-- post_id 不设外键：与 community_posts 的既有约定一致（帖子删了不级联，
-- 收藏流里那条会渲染成"原帖已删除"，用户自己决定要不要清掉，
-- 总比收藏凭空消失好）。级联删除反而会让用户困惑。
--
-- 幂等：可重复执行。

create table if not exists public.bookmark_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  post_id    uuid,                                  -- null = 自己写的备注
  content    text not null default '',              -- 备注正文；收藏帖子时为空
  created_at timestamptz not null default now()
);

-- 同一篇帖子只能收藏一次（备注条目的 post_id 为 null，不受此约束影响，
-- 因为 PG 的唯一索引里 NULL 互不相等，可以存任意多条）
create unique index if not exists uq_bookmark_post
  on public.bookmark_entries (user_id, post_id)
  where post_id is not null;

-- 拉自己的收藏流（按时间倒序）
create index if not exists idx_bookmark_user_time
  on public.bookmark_entries (user_id, created_at desc);

alter table public.bookmark_entries enable row level security;

comment on table public.bookmark_entries is
  '收藏流：post_id 有值=收藏的帖子，为空=自己写的备注；按时间排成"和自己的对话"';

-- ---------------------------------------------------------------- 举报

create table if not exists public.post_reports (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null,
  reporter_id uuid not null,
  reason      text not null,                        -- 预设理由的 key
  detail      text,                                 -- 选填补充说明
  status      text not null default 'pending'
              check (status in ('pending', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz
);

-- 同一人对同一帖只留一条举报：反复点不该刷屏后台，也不该让站长
-- 面对十条一模一样的记录去判断
create unique index if not exists uq_report_post_user
  on public.post_reports (post_id, reporter_id);

-- 后台按状态倒序看
create index if not exists idx_reports_status_time
  on public.post_reports (status, created_at desc);

alter table public.post_reports enable row level security;

comment on table public.post_reports is
  '帖子举报：同一人对同一帖只有一条；status 由后台流转';

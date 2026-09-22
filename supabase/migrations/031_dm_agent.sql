-- 031 官方留言的人工客服（接入 / 结束 + 自动回复闸门）
--
-- 用户 2026-09-22 拍板的设计：
--   ① 后台按**邮箱聚合**显示留言（一条消息一行没法用），能一眼看出谁还没回；
--   ② 后台可以**接入聊天**，以官方身份回复；
--   ③ 接入后**暂停自动回复**，等站长点「结束服务」再恢复；
--   ④ 用户端要能看出「客服已介入」。
--
-- 两个数据变化：
--   · dm_messages.kind —— 区分三种消息。原来所有官方消息一律 sender=哨兵 UUID，
--     分不出「机器人自动回」和「真人回的」，而用户端要显示的正是这个区别。
--       text   普通消息（用户发的 / 官方自动回复）
--       agent  人工客服发的（用户端打「客服」标签）
--       system 系统提示（用户端渲染成居中灰字，如「客服已介入」）
--     用一列而不是「by_admin + is_system」两列：三种状态互斥，一列就够。
--   · dm_agent_state —— 谁正在被人工接管。**必须落库**，不能用「最后一条是不是
--     客服发的」推导：那样用户回一句之后就会误判成自动模式，自动回复会插进来
--     打断人工对话。接管状态是显式开关：接入置 true，结束置 false。
--
-- 幂等：可重复执行。

alter table public.dm_messages
  add column if not exists kind text not null default 'text';

alter table public.dm_messages drop constraint if exists dm_messages_kind_check;
alter table public.dm_messages add constraint dm_messages_kind_check
  check (kind in ('text', 'agent', 'system'));

comment on column public.dm_messages.kind is
  'text=普通消息 · agent=人工客服发的 · system=系统提示（客服接入/结束）';

create table if not exists public.dm_agent_state (
  user_id    uuid primary key,               -- 与官方对话的那个用户
  active     boolean not null default true,  -- true=客服接管中（自动回复暂停）
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.dm_agent_state is
  '官方留言的人工接管状态：active=true 时该用户与官方的对话暂停自动回复；站长点「结束服务」置 false';

-- 与其余业务表一致：不开 RLS policy，只经服务端 service_role 访问
alter table public.dm_agent_state enable row level security;

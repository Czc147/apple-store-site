-- 025 好友关系 + 私信（探究广场 · 对话板块）
--
-- 用户 2026-09-22 需求：对话板块显示在交流板块添加的好友、可同意好友申请、
-- 顶栏固定官方对话入口、给官方留言后小机器人自动回复（回复文案后台可配）。
--
-- 设计取舍：
--
-- 1) friendships 用一条**无向边**表示一对关系，靠表达式唯一索引防重。
--    不存两条有向边（A→B、B→A）：那样"我们是不是好友"要查两次，
--    而且并发下容易只写进去一条。requester_id 单独记住是谁发起的，
--    这样对方看到的是"XX 请求加你好友"而不是"你请求了 XX"。
--
-- 2) dm_messages 用**信箱模型**（每条消息记 sender/recipient），不建会话表。
--    会话表要么让两个参与者各存一份（消息重复），要么做 least/greatest 规范化
--    （官方会话的 peer 为 null，规范化会变复杂）。信箱模型下：
--      · 好友会话 = (sender=我 AND recipient=对方) OR (sender=对方 AND recipient=我)
--      · 官方会话 = recipient=我 AND sender IS NULL
--    没有重复存储，也不需要 thread 表。代价是"列出我的会话"要按对端聚合，
--    在私信这种量级完全够用。
--
-- 3) sender_id 允许为 null = 官方（与 community_posts.user_id 的官方约定一致）。
--
-- 幂等：可重复执行。

-- ---------------------------------------------------------------- 好友

create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null,                       -- 发起方
  addressee_id uuid not null,                       -- 被请求方
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'rejected')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_no_self check (requester_id <> addressee_id)
);

-- 一对用户只能有一条关系边（不管谁发起）。用表达式唯一索引，
-- 由 PG 负责规范化，应用层不必自己算 least/greatest。
create unique index if not exists uq_friendship_pair
  on public.friendships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

-- 「我的好友」与「待我处理的申请」两条查询路径
create index if not exists idx_friendships_requester
  on public.friendships (requester_id, status);
create index if not exists idx_friendships_addressee
  on public.friendships (addressee_id, status);

alter table public.friendships enable row level security;

comment on table public.friendships is
  '好友关系：一对用户一条无向边；requester_id 记住谁发起的，供对方展示"XX 请求加你"';

-- ---------------------------------------------------------------- 私信

create table if not exists public.dm_messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid,                                 -- null = 官方（小机器人）
  recipient_id uuid not null,                        -- 收件人（官方消息也必须有收件人）
  content      text not null,
  created_at   timestamptz not null default now(),
  read_at      timestamptz                           -- 收件人已读时刻；null = 未读
);

-- 收件箱 / 未读计数
create index if not exists idx_dm_inbox
  on public.dm_messages (recipient_id, created_at desc);
-- 发件箱（拼会话时反查对端）
create index if not exists idx_dm_outbox
  on public.dm_messages (sender_id, created_at desc);
-- 好友会话整段拉取
create index if not exists idx_dm_pair
  on public.dm_messages (recipient_id, sender_id, created_at);

alter table public.dm_messages enable row level security;

comment on table public.dm_messages is
  '私信信箱模型：每条记 sender/recipient；sender_id 为 null 表示官方（小机器人）';
comment on column public.dm_messages.read_at is
  '收件人的已读时刻，null 表示未读；发件人侧不做已读回执';

-- ---------------------------------------------------------------- 后台可配的自动回复

insert into public.app_settings (key, value) values
  ('official_auto_reply',
   '收到你的留言啦，官方会尽快回复你。急事可以直接联系客服 QQ：3821587061'),
  ('official_reply_rules', '')
on conflict (key) do nothing;

comment on column public.app_settings.value is
  'official_reply_rules 用每行一条「关键词=回复内容」的格式；命中关键词时优先于默认文案';

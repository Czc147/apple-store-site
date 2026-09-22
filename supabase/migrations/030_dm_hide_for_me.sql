-- 030 对话「删除聊天记录」= 只对我隐藏（迁移 026 的补充）
--
-- 用户 2026-09-22 拍板：对话行的左滑删除，语义从「删好友」改成「删聊天记录」，
-- 并且**只对我隐藏**（各删各的，对方那边不受影响）。
--
-- 为什么不直接删 dm_messages 的行：那是双方共用的一张表，删掉等于替对方
-- 也删了历史 —— 对方会莫名其妙丢记录，而且他说过的话并没有被撤回的语义。
-- 所以这里只记一条**水位线**：「我和这个人，hidden_before 之前的消息我都不再看到」。
--   · 水位线之前的消息：我这边会话列表与聊天详情都不再出现
--   · 之后对方再发新消息：时间戳大于水位线 → 会话自然重新出现（这是对的语义，
--     也是「删记录」与「拉黑」的区别）
--
-- 幂等：可重复执行。

create table if not exists public.dm_hidden (
  user_id       uuid not null,
  peer_id       uuid not null,
  hidden_before timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, peer_id)
);

comment on table public.dm_hidden is
  '对话隐藏水位线：user_id 不再看到与 peer_id 之间 hidden_before 之前的消息（只影响自己，不动对方的数据）';

-- 与其余业务表一致：不开 RLS policy，只经服务端 service_role 访问
alter table public.dm_hidden enable row level security;

-- ---------------------------------------------------------------- 会话列表
-- 只改一处：把「我看得到的消息」先按水位线过一遍，其余聚合逻辑不变。
-- 注意 unread_count 也在过滤之后算，否则删掉记录后角标还挂着未读数。
create or replace function public.list_dm_threads(p_user_id uuid)
returns table (
  peer_id     uuid,
  is_official boolean,
  last_content text,
  last_at     timestamptz,
  last_from_me boolean,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with hidden as (
    select h.peer_id, h.hidden_before
    from public.dm_hidden h
    where h.user_id = p_user_id
  ),
  mine as (
    select
      case
        when m.sender_id = p_user_id then m.recipient_id
        else m.sender_id
      end as peer_id,
      m.content,
      m.created_at,
      m.sender_id,
      m.recipient_id,
      m.read_at
    from public.dm_messages m
    where m.sender_id = p_user_id or m.recipient_id = p_user_id
  ),
  visible as (
    select m.peer_id, m.content, m.created_at, m.sender_id, m.recipient_id, m.read_at
    from mine m
    left join hidden h on h.peer_id = m.peer_id
    where h.hidden_before is null or m.created_at > h.hidden_before
  ),
  agg as (
    select
      peer_id,
      (array_agg(content order by created_at desc))[1]        as last_content,
      max(created_at)                                          as last_at,
      (array_agg(sender_id order by created_at desc))[1] = p_user_id as last_from_me,
      count(*) filter (where recipient_id = p_user_id and read_at is null) as unread_count
    from visible
    group by peer_id
  )
  select
    a.peer_id,
    a.peer_id = '00000000-0000-0000-0000-000000000000'::uuid as is_official,
    a.last_content,
    a.last_at,
    a.last_from_me,
    a.unread_count
  from agg a
  order by a.last_at desc;
$$;

revoke execute on function public.list_dm_threads(uuid) from public, anon;
grant execute on function public.list_dm_threads(uuid) to service_role;

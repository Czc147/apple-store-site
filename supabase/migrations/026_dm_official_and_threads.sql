-- 026 私信：官方用哨兵 UUID + 会话列表 RPC
--
-- 025 里把「官方」记成 sender_id is null，实际用起来是自相矛盾的：
-- 「我发给官方」的消息必须有个收件人，而 recipient_id 是 not null，
-- 于是"官方"这个身份在一半的消息里没法表达。改成**哨兵 UUID**：
--
--   官方账号 id = 00000000-0000-0000-0000-000000000000
--   · 我发给官方 → sender=me,        recipient=哨兵
--   · 官方回我   → sender=哨兵,      recipient=me
--
-- 这样对端恒等于「sender = 我 ? recipient : sender」，一个表达式走遍两种情况，
-- 也不需要 sender_id 可空。哨兵 UUID 不可能与真实 auth 用户冲突
-- （gen_random_uuid 不会生成全零）。
--
-- 幂等：可重复执行。

-- 先清掉 025 可能留下的 null sender（此时无真实数据，纯防御）
delete from public.dm_messages where sender_id is null;

alter table public.dm_messages alter column sender_id set not null;

comment on column public.dm_messages.sender_id is
  '发件人；官方为哨兵 UUID 00000000-0000-0000-0000-000000000000';
comment on table public.dm_messages is
  '私信信箱模型：每条记 sender/recipient，对端 = (sender=我 ? recipient : sender)；官方为哨兵 UUID';

-- 会话列表：按对端聚合出「最后一条 + 未读数」。
-- 不用"拉全部消息到应用层分组"——那样用户聊得越多越慢，而且历史长的会话
-- 会把老会话挤出分页窗口，表现成"对话凭空消失"。
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
  with mine as (
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
  agg as (
    select
      peer_id,
      (array_agg(content order by created_at desc))[1]        as last_content,
      max(created_at)                                          as last_at,
      (array_agg(sender_id order by created_at desc))[1] = p_user_id as last_from_me,
      count(*) filter (where recipient_id = p_user_id and read_at is null) as unread_count
    from mine
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

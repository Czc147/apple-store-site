-- ============================================================
-- 迁移 013：用户权益扩展为「订阅」类型
--
-- 需求：每日计划不再是独特订阅，任何订阅都能购买解锁后入库。
-- 权益表新增 kind='subscription'：一用户一订阅一条（部分唯一索引），
-- 重复解锁叠加有效期（原子 upsert，镜像 grant_daily_plan）。
--
-- 本迁移做四件事：
--   1. user_entitlements.kind 扩为 daily_plan / content / subscription
--   2. 加 subscription_id（指向 subscriptions.id，权益归属订阅）
--   3. 加 media_path（私有桶对象路径，灵活存文件内容）
--   4. source 扩为 redeem / sync / admin / order
--   5. 新增 RPC grant_subscription(...)（服务端 service_role 专用）
--
-- 幂等：约束先 drop if exists 再重建；列 add column if not exists。
-- 使用方法：Supabase Dashboard → SQL Editor → 运行本文件（幂等）
-- ============================================================


-- ============================================================
-- 1. 扩展 kind / source 检查约束（drop 旧约束 → 重建含新值）
--    源迁移 005 里 kind/source 均为内联列 check，自动命名
--    user_entitlements_kind_check / user_entitlements_source_check。
-- ============================================================
alter table public.user_entitlements
  drop constraint if exists user_entitlements_kind_check;
alter table public.user_entitlements
  add constraint user_entitlements_kind_check
  check (kind in ('daily_plan', 'content', 'subscription'));

alter table public.user_entitlements
  drop constraint if exists user_entitlements_source_check;
alter table public.user_entitlements
  add constraint user_entitlements_source_check
  check (source in ('redeem', 'sync', 'admin', 'order'));


-- ============================================================
-- 2. 新增列
-- ============================================================
alter table public.user_entitlements
  add column if not exists subscription_id uuid;

alter table public.user_entitlements
  add column if not exists media_path text;

comment on column public.user_entitlements.subscription_id
  is 'kind=subscription 时：指向 subscriptions.id，一用户一订阅单条叠加';
comment on column public.user_entitlements.media_path
  is '内容文件在私有桶的对象路径（用于订阅仓库商品等），签名 URL 现签不入库';


-- ============================================================
-- 3. subscription：每用户每订阅一条（部分唯一索引，叠加延期冲突目标）
-- ============================================================
create unique index if not exists uq_entitlements_subscription
  on public.user_entitlements (user_id, subscription_id)
  where kind = 'subscription';


-- ============================================================
-- 4. RPC grant_subscription(用户, 邮箱, 订阅, 卡密, 有效天数, source)
--    订阅权益的原子写入（订单确认 / 兑换 / 我的库同步共用）：
--      - 无记录：插入（expires_at = now() + 天数；天数 null = 永久）
--      - 已有记录：叠加延期（同 grant_daily_plan 的三种情形）
--    返回写入后的权益行（含真实 expires_at）。
-- ============================================================
create or replace function public.grant_subscription(
  p_user_id         uuid,
  p_user_email      text,
  p_subscription_id uuid,
  p_card_key_id     uuid,
  p_duration_days   integer,          -- null = 永久
  p_source          text default 'order'   -- order / redeem / sync / admin
)
returns public.user_entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires timestamptz;
  v_result  public.user_entitlements;
begin
  if p_duration_days is null then
    v_expires := null;
  else
    v_expires := now() + make_interval(days => p_duration_days);
  end if;

  insert into public.user_entitlements
    (user_id, user_email, kind, subscription_id, card_key_id, expires_at, unlocked_at, source)
  values
    (p_user_id, p_user_email, 'subscription', p_subscription_id, p_card_key_id, v_expires, now(), p_source)
  on conflict (user_id, subscription_id) where kind = 'subscription'
  do update set
    expires_at = case
      when excluded.expires_at is null then null
      when user_entitlements.expires_at is null then null
      else greatest(user_entitlements.expires_at, now())
           + make_interval(days => p_duration_days)
    end,
    user_email  = excluded.user_email,
    card_key_id = excluded.card_key_id,
    source      = excluded.source
  returning * into v_result;

  return v_result;
end;
$$;

-- 仅服务端 service_role 可调用
revoke execute on function public.grant_subscription(uuid, text, uuid, uuid, integer, text)
  from public, anon;
grant execute on function public.grant_subscription(uuid, text, uuid, uuid, integer, text)
  to service_role;

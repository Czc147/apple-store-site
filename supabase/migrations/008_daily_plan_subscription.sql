-- ============================================================
-- 迁移 008：订阅支持「每日计划」类型
--
-- 让「每日计划」成为订阅的一种显式类型，可在后台订阅管理直接添加；
-- 用户购买后拿卡密兑换即可解锁「每日推荐」。
--
-- 做三件事：
--   1. subscriptions 加 type（normal 普通订阅 / daily_plan 每日计划）
--   2. subscriptions 加 unlock_duration_days（每日计划解锁有效天数，null=永久）
--   3. 部分唯一索引：强制 daily_plan 类型最多一条（DB 层兜底）
--
-- 使用方法：Supabase Dashboard → SQL Editor → 运行本文件（幂等，可重复执行）
-- ============================================================

alter table public.subscriptions
  add column if not exists type text not null default 'normal';

-- 具名 check 约束（列已存在时不补约束，须单独判存，同 005 写法）
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_type_check') then
    alter table public.subscriptions add constraint subscriptions_type_check
      check (type in ('normal', 'daily_plan'));
  end if;
end $$;

alter table public.subscriptions
  add column if not exists unlock_duration_days integer;

-- 每日计划类型全局最多一条：部分唯一索引（只约束 type='daily_plan' 的行）
create unique index if not exists uq_subscriptions_daily_plan
  on public.subscriptions (type)
  where type = 'daily_plan';

comment on column public.subscriptions.type
  is '订阅类型：normal 普通订阅（兑换内容）/ daily_plan 每日计划（解锁每日推荐）';
comment on column public.subscriptions.unlock_duration_days
  is '每日计划解锁有效天数（仅 daily_plan 有意义）；null=永久，自核销时刻起算';

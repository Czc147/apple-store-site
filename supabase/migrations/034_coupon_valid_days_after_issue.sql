-- 034: 券支持「发券后 N 天有效」（卡券订阅发券用）
--
-- 问题：`coupons.valid_from / valid_to` 是**固定日期**。用户半年后买卡券订阅，
-- 挂上去的券早就过期了 —— 发到手里也是废纸。
--
-- 做法：给券加一个可空的 `valid_days_after_issue`：
--   - **留空（默认）**：沿用现有的固定时间窗，**对现有券零影响**。
--   - **填了**：以**领取时刻**起算 N 天（只对"发到手上"的那张券生效，
--     即 `coupon_claims.claimed_at + N 天`）；模板的固定窗对该券不再适用。
--
-- 有效期只在 claims 上现算（claimed_at + N），**不额外存列** ——
-- 存下来就有两个真相，改配置时必然对不上（与 group_buy 的分摊价同一套理由）。

alter table public.coupons
  add column if not exists valid_days_after_issue integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'coupons_valid_days_after_issue_check'
  ) then
    alter table public.coupons add constraint coupons_valid_days_after_issue_check
      check (
        valid_days_after_issue is null
        or (valid_days_after_issue > 0 and valid_days_after_issue <= 3650)
      );
  end if;
end $$;

comment on column public.coupons.valid_days_after_issue is
  '发券后有效天数（迁移 034）：空 = 沿用 valid_from/valid_to 固定窗；非空 = 以领取时刻起算 N 天';

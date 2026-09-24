-- 032: 订阅三分类 —— 给 subscriptions.type 加入 'coupon'（卡券订阅）
--
-- 用户 2026-09-24 拍板把订阅分成三类：普通订阅 / 高级订阅 / 卡券订阅。
--
--   - 「高级订阅」= 原「每日计划」**原地升级**：只改显示名（见 lib/types.ts 的
--     SUBSCRIPTION_TYPE_LABEL），底层值仍然是 'daily_plan'。
--     理由：那个字符串同时出现在 user_entitlements.kind、lib/daily-access.ts、
--     后台卡密表单等多处，改值要动数据 + 约束 + 逻辑分支，收益只是"好看"。
--     **所以本迁移刻意不动 daily_plan。**
--
--   - 「卡券订阅」是新的一类：买的是"卡 + 券"（VIP 会员卡 + 优惠券），
--     产物落「我的券」而不是「我的订阅」。
--
-- 纯新增一个取值，不触碰任何既有数据。

alter table public.subscriptions
  drop constraint if exists subscriptions_type_check;

alter table public.subscriptions
  add constraint subscriptions_type_check
  check (type in ('normal', 'daily_plan', 'coupon'));

comment on column public.subscriptions.type is
  '订阅类型：normal 普通订阅 / daily_plan 高级订阅（原名「每日计划」，只改过显示名、底层值未动）/ coupon 卡券订阅';

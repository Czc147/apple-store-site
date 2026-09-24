-- 036: 高级订阅的「高级设置」展示字段（第一批）
--
-- 用户 2026-09-24 要求「高级订阅编辑时要有一些高级设置」。这一批刻意只放
-- **纯展示**字段（不参与任何业务判定），所以风险最低、改完立刻看得见：
--   - badge_text  角标文案（「热门」「限量」），订阅卡片上
--   - benefits    权益清单（"你将获得什么"），购买弹层逐条列出
--   - terms_text  购买须知 / 条款，购买弹层一段灰字
--   - is_featured 是否作为主推大卡（原本是"列表第一张自动是"，改成可显式指定）
--
-- 刻意**没有**放进来的（属于**行为变更**，要单独决策，别混进展示字段里）：
--   · 到期后内容处理（keep / revoke）—— 现状是"过期即失去访问"，
--     改成"保留已获得"要动「我的库」的核心读取路径
--   · 上架时间窗（限时发售）
--   · 每人限购
-- 这三项等站长拍板再单独做。

alter table public.subscriptions
  add column if not exists badge_text text;

alter table public.subscriptions
  add column if not exists benefits jsonb;

alter table public.subscriptions
  add column if not exists terms_text text;

alter table public.subscriptions
  add column if not exists is_featured boolean not null default false;

comment on column public.subscriptions.badge_text is
  '角标文案（迁移 036），订阅卡片上展示；空 = 不显示';
comment on column public.subscriptions.benefits is
  '权益清单（迁移 036）：字符串数组，购买弹层逐条展示"你将获得什么"';
comment on column public.subscriptions.terms_text is
  '购买须知 / 条款（迁移 036），购买弹层展示；空 = 不显示';
comment on column public.subscriptions.is_featured is
  '是否作为主推大卡（迁移 036）：前台优先拿它当主推，没有则退回列表第一张';

-- benefits 必须是数组（或 null）：写进对象/字符串会让前端 .map() 直接炸
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_benefits_is_array'
  ) then
    alter table public.subscriptions add constraint subscriptions_benefits_is_array
      check (benefits is null or jsonb_typeof(benefits) = 'array');
  end if;
end $$;

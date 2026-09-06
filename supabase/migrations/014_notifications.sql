-- ============================================================
-- 迁移 014：通知（用户仓库有新权益 / 订阅内容更新推送）
--
-- 触发场景：
--   1. 管理员在订单确认收款并派发卡密 → 每用户一条（订阅解锁 / 新密钥入库）。
--   2. 管理员在订阅仓库「一键推送」内容更新 → 该订阅的所有订阅者各一条。
--
-- payload：jsonb，存聚合提示（如 ref_type / ref_id / url），前台点击跳转用。
-- read_at：null=未读。
--
-- RLS：enable 且零 policy——只走本站 API（service_role），读按登录用户过滤。
-- 使用方法：Supabase Dashboard → SQL Editor → 运行本文件（幂等）
-- ============================================================
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,                    -- 接收账号（auth.users.id）
  title      text,                             -- 标题（如「订阅已解锁」）
  body       text,                             -- 正文
  payload    jsonb,                            -- 附加（ref_type/ref_id/url 等）
  read_at    timestamptz,                      -- 已读时刻；null=未读
  created_at timestamptz not null default now()
);

-- 按用户取未读/列表
create index if not exists idx_notifications_user
  on public.notifications (user_id, created_at desc);

comment on table public.notifications
  is '通知：订阅解锁/新密钥入库/内容更新推送；read_at null=未读';
comment on column public.notifications.payload
  is 'jsonb 附加信息（ref_type/ref_id/url），前台按需跳转';

alter table public.notifications enable row level security;

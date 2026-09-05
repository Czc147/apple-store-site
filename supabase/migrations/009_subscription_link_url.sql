-- ============================================================
-- 迁移 009：订阅「跳转链接」列
--
-- subscriptions 增加 link_url text 列：
--   前台订阅卡片点击弹层展示「了解更多」入口，
--   由后台「订阅管理 → 跳转链接」填写（选填，新标签页打开）。
--
-- 使用方法：Supabase Dashboard → SQL Editor → 运行本文件（幂等，可重复执行）
-- ============================================================

alter table public.subscriptions add column if not exists link_url text;

comment on column public.subscriptions.link_url
  is '跳转链接：前台订阅卡片弹层的「了解更多」入口（选填）';

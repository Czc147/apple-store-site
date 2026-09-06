-- ============================================================
-- 迁移 015：收款设置（微信/支付宝个人收款码）
--
-- 前台结算弹窗：「去微信支付 / 去支付宝支付」→ 弹后台配好的收款码图。
-- 两张图各是一个 URL，存 app_settings key-value。
--   支付前须确认内容为原创/有授权（见方案 Phase 3 闸）。
--
-- 幂等：on conflict (key) do nothing。
-- 使用方法：Supabase Dashboard → SQL Editor → 运行本文件（幂等）
-- ============================================================
insert into public.app_settings (key, value)
values
  ('payment_wechat_qr_url', ''),
  ('payment_alipay_qr_url', '')
on conflict (key) do nothing;

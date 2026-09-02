-- ============================================================
-- 迁移 004：订阅「详细介绍」列 + 兑换商品注释统一
--
-- 1. subscriptions 增加 description text 列：
--    前台订阅卡片点击弹层展示的完整介绍，
--    由后台「订阅管理 → 详细介绍」填写。
-- 2. redeem_image_url 列注释由「兑换图片」统一为「兑换商品」
--    （004 起支持上传图片 / 视频 / 文档，列名保持不变）。
--
-- 使用方法：Supabase Dashboard → SQL Editor → 运行本文件
--           （全部语句幂等，可重复执行）
-- ============================================================

alter table public.subscriptions add column if not exists description text;

comment on column public.subscriptions.description
  is '详细介绍：前台订阅页点击卡片弹层展示';

comment on column public.sub_units.redeem_image_url
  is '兑换商品：不公开，买家输入卡密兑换成功后弹出（图片 / 视频 / 文档）';
comment on column public.activities.redeem_image_url
  is '兑换商品：不公开，买家输入卡密兑换成功后弹出（与公开卡片图 image_url 无关）';
comment on column public.subscriptions.redeem_image_url
  is '兑换商品：不公开，买家输入卡密兑换成功后弹出（图片 / 视频 / 文档）';

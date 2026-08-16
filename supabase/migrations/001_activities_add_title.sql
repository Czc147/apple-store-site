-- ============================================================
-- 迁移 001：activities 表补充 title 列
-- 背景：「活动」页需要把活动标题叠加在卡片大图上（Apple Today 风格）
-- 安全：新增可空列，不影响已有数据；已建过该列的项目重复执行也不报错
-- 使用：Supabase Dashboard → SQL Editor → 运行本文件
-- ============================================================

alter table public.activities
  add column if not exists title text;

comment on column public.activities.title
  is '活动标题，白色粗体叠加在卡片图片上；旧数据为空时前端回退到 description 首行';

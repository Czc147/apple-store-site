-- ============================================================
-- 迁移 007：首页板块支持「选入对应的大单元」
--
-- home_sections 新增 major_unit_ids 列：显式记录该板块包含哪些大单元。
-- 语义：
--   - 非空数组  → 只按数组里的 id 顺序渲染这些大单元
--   - 空数组    → 回退旧逻辑（featured_only=true 显示精选，否则显示全部）
--
-- 使用方法：Supabase Dashboard → SQL Editor → 运行本文件（幂等，可重复执行）
-- ============================================================

alter table public.home_sections
  add column if not exists major_unit_ids uuid[] not null default '{}';

comment on column public.home_sections.major_unit_ids
  is '该板块显式选入的大单元 id 列表（按此顺序渲染）；为空则回退 featured_only / 全部';

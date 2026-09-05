-- ============================================================
-- 迁移 006：首页装修（板块 + 卡片封面 + Hero 增强 + 全局配置）
--
-- 做四件事：
--   1. major_units 加卡片封面配置列（副标题 / 封面底色 / 图标 / 精选）
--   2. daily_picks 加 Hero 增强列（tagline 副标题 / 强调色）
--   3. 新增 home_sections 首页板块表（标题 + 卡片流；carousel/grid）
--   4. 新增 app_settings 全局配置表（key-value）
--
-- 使用方法：Supabase Dashboard → SQL Editor → 运行本文件
--           （全部语句幂等，可重复执行）
-- ============================================================


-- ============================================================
-- 1. major_units · 卡片封面配置
--    subtitle     卡片名称下的副标题（覆盖默认「N 个可选内容」）
--    cover_color  无图时的底色 / 渐变（hex 或 CSS 渐变串）
--    app_icon     左上角小图标（emoji 或图片 URL）
--    featured     精选标记（首页「精选」板块只展示打了标的卡片）
-- ============================================================
alter table public.major_units
  add column if not exists subtitle    text,
  add column if not exists cover_color text,
  add column if not exists app_icon    text,
  add column if not exists featured    boolean not null default false;

comment on column public.major_units.subtitle    is '卡片名称下的副标题；为空时前台回退「N 个可选内容」';
comment on column public.major_units.cover_color is '无图时的底色或 CSS 渐变（如 #E9F1FB 或 linear-gradient(...)）';
comment on column public.major_units.app_icon    is '卡片左上角小图标（emoji 或图片 URL）';
comment on column public.major_units.featured    is '精选标记：首页「精选」板块只展示勾选的卡片';


-- ============================================================
-- 2. daily_picks · Hero 增强
--    subtitle     封面上的 tagline（未解锁也可见）
--    accent_color Hero 无图占位的渐变主色
-- ============================================================
alter table public.daily_picks
  add column if not exists subtitle     text,
  add column if not exists accent_color text;

comment on column public.daily_picks.subtitle     is 'Hero 封面上的 tagline（未解锁也可见）';
comment on column public.daily_picks.accent_color is 'Hero 无图占位的渐变主色';


-- ============================================================
-- 3. home_sections · 首页板块
--    一个板块 = 首页一段「标题 + 卡片流」，v1 只渲染大单元卡片。
--    layout        carousel 横向滚动吸附 / grid 两列网格
--    featured_only true = 只显示打了「精选」标记的大单元
--    RLS：enable 且【不建 policy】——内容只经本站 API（service_role）读写
-- ============================================================
create table if not exists public.home_sections (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  subtitle      text,
  layout        text not null default 'carousel'
                check (layout in ('carousel', 'grid')),
  featured_only boolean not null default false,
  enabled       boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.home_sections
  is '首页板块：一段「标题 + 卡片流」；v1 只渲染大单元卡片，按 sort_order 升序展示';
comment on column public.home_sections.featured_only
  is 'true=只显示 major_units.featured 为真的卡片（精选流）';

-- 前台按 sort_order 升序取启用的板块
create index if not exists idx_home_sections_order
  on public.home_sections (sort_order, created_at)
  where enabled = true;

alter table public.home_sections enable row level security;


-- ============================================================
-- 4. app_settings · 全局配置（key-value）
--    预置四个 key（写入用 upsert）：
--      site_title    站点标题（浏览器标题/品牌名）
--      home_greeting 首页大标题（默认「选购」）
--      home_subtitle 首页副标题
--      announcement  顶部公告条（空 = 隐藏）
--    RLS：enable 且零 policy
-- ============================================================
create table if not exists public.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

comment on table public.app_settings
  is '首页/站点全局配置（key-value）；空值视为未设置，前台回退默认文案';

insert into public.app_settings (key, value)
values
  ('site_title',    ''),
  ('home_greeting', ''),
  ('home_subtitle', ''),
  ('announcement',  '')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

-- 028 共享：用户与官方交换资源（探究广场 · 共享板块）
--
-- 用户需求原文：
--   「用户和官方交换资源，用户可以上传资源文件（提示：上传网盘分享图片或分享链接），
--     然后上传参考图，再选择对应要换的小单元，初始这个资源文件双方都是未解锁状态，
--     官方只能看到用户的参考图，用户只能看到对应小单元的名字，
--     待官方后台确定交换后即可解锁，用户选的小单元会自动入库。」
--
-- 所以是**双边盲**：
--   · 官方看得到：参考图 + 用户想要的小单元（名字）
--   · 用户看得到：自己选的小单元（名字）+ 状态
--   · 资源本身（链接 / 网盘分享图）**双方在通过前都看不到** —— 这不是 UI 上的
--     障眼法，而是接口层就不返回那个字段，见 /api/share-exchanges 的 shaping。
--     用户上传的资源是本单最值钱的东西，通过前泄露给任何一方都会让交换失衡。
--
-- 通过后：用户的资源对官方开放；用户选的小单元以「内容权益」自动入库。
--
-- 幂等：可重复执行。

create table if not exists public.share_exchanges (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  user_email    text,

  -- 用户交出的资源（通过前对双方都不可见）
  resource_kind text not null default 'link'
                check (resource_kind in ('link', 'image')),
  resource_url  text not null,          -- 网盘分享链接，或上传的分享图 URL
  resource_note text,                   -- 提取码 / 说明之类

  -- 用户给的参考图（官方据此判断要不要换）
  ref_image_url text not null,

  -- 用户想换的小单元
  wanted_sub_unit_id uuid not null,

  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected', 'canceled')),
  review_note   text,                   -- 官方处理时留的说明
  handled_at    timestamptz,

  -- 通过后派发的权益（便于回溯"这条交换给了哪条权益"）
  entitlement_id uuid,

  created_at    timestamptz not null default now()
);

-- 用户看自己的列表
create index if not exists idx_share_user_time
  on public.share_exchanges (user_id, created_at desc);

-- 后台按待处理优先看
create index if not exists idx_share_status_time
  on public.share_exchanges (status, created_at desc);

alter table public.share_exchanges enable row level security;

comment on table public.share_exchanges is
  '共享交换：用户交出资源换一个小单元；通过前资源对双方都不可见（接口层不返回）';
comment on column public.share_exchanges.resource_url is
  '网盘分享链接或分享图；status != approved 时**不返回给任何一方**';
comment on column public.share_exchanges.ref_image_url is
  '参考图：官方据此判断是否交换；这是官方在通过前唯一能看到的东西';

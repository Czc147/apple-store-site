-- ============================================================
-- 迁移 005：每日计划（每日推荐 + 兑换码解锁 + 用户权益）
--
-- 业务闭环：
--   管理员在后台「每日推荐」上传每日内容（图片/文件 + 可选跳转链接）→
--   买家在订阅区购买「每日计划」拿到兑换码 → 站内输码解锁 →
--   选购页「每日推荐」区块常驻开启，可看今日更新与全部历史仓库。
--
-- 本迁移做五件事：
--   1. 新增 daily_picks 每日推荐内容表（一天一条，日期唯一）
--   2. 新增私有桶 daily（付费内容不落公开直链，凭签名 URL 访问）
--   3. card_products 扩展「兑换类型」：content 兑换内容 /
--      unlock_daily 解锁每日计划（有效天数由管理员在后台决定）
--   4. card_keys 增加 bound_user_id（码绑定到账号，CAS 抢占式绑定）
--   5. 新增 user_entitlements 用户权益表（「我的库」数据源）
--
-- 使用方法：Supabase Dashboard → SQL Editor → 运行本文件
--           （全部语句幂等，可重复执行）
-- ============================================================


-- ============================================================
-- 1. daily_picks · 每日推荐内容
--    一天一条（pick_date 唯一）；「今日」由管理员指定的日期决定。
--    media_path 存私有桶 daily 的对象路径（永不落签名 URL）；
--    cover_url 是公开桶 teaser 封面（未解锁也可见，营销用）。
--    RLS：enable 且【不建 policy】——内容资产匿名零访问，
--    前台/后台一律走本站 API（service_role），见 002 同款模式。
-- ============================================================
create table if not exists public.daily_picks (
  id          uuid primary key default gen_random_uuid(),
  pick_date   date not null,                    -- 哪天的更新（唯一）
  title       text not null,                    -- 标题（未解锁可见）
  description text,                             -- 介绍（解锁后可见）
  cover_url   text,                             -- 封面图（公开桶，选购页区块展示）
  media_path  text,                             -- 内容文件路径（私有桶 daily）
  link_url    text,                             -- 跳转链接（可选，如外部视频地址）
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 一天一条；兼作「按日期倒序列表」索引（btree 可双向扫描）
create unique index if not exists uq_daily_picks_date
  on public.daily_picks (pick_date);

comment on table public.daily_picks
  is '每日推荐内容：一天一条；封面公开、内容文件存私有桶，只经本站 API 访问';
comment on column public.daily_picks.media_path
  is '内容文件在私有桶 daily 的对象路径；签名 URL 由服务端现签，禁止入库';
comment on column public.daily_picks.cover_url
  is '封面图：存公开 images 桶，未解锁也可见（营销 teaser）';


-- ============================================================
-- 2. Storage · 私有桶 daily（付费内容）
--    public=false 且【不建任何 storage policy】：
--    匿名端零读取零写入，仅服务端 service_role 通过
--    createSignedUrl 签发 1 小时临时链接（见 /api/daily-content）。
-- ============================================================
insert into storage.buckets (id, name, public)
values ('daily', 'daily', false)
on conflict (id) do update set public = false;


-- ============================================================
-- 3. card_products · 兑换类型扩展
--    content（默认，现有行为：核销后弹出兑换内容）
--    unlock_daily（新：核销后解锁「每日计划」）
--    unlock_duration_days：有效天数，null = 永久；
--    有效期从核销时刻（card_keys.issued_at）起算，服务端现算。
-- ============================================================
alter table public.card_products
  add column if not exists redeem_type text not null default 'content';

-- 具名 check 约束（add column if not exists 列已存在时不补约束，须单独判存，见 003 同款）
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'card_products_redeem_type_check') then
    alter table public.card_products add constraint card_products_redeem_type_check
      check (redeem_type in ('content', 'unlock_daily'));
  end if;
end $$;

alter table public.card_products
  add column if not exists unlock_duration_days integer;

comment on column public.card_products.redeem_type
  is '兑换类型：content 兑换内容 / unlock_daily 解锁每日计划';
comment on column public.card_products.unlock_duration_days
  is '解锁有效天数（仅 unlock_daily）：null=永久；有效期自核销时刻起算';


-- ============================================================
-- 4. card_keys · 账号绑定
--    一码至多绑一个账号：绑定用 CAS（update ... where bound_user_id is null），
--    无需唯一索引（列本身单值）。「我的库」同步/兑换时写入；
--    后台撤销权益时必须清空，否则旧码重放即可复活权益。
-- ============================================================
alter table public.card_keys
  add column if not exists bound_user_id uuid;

comment on column public.card_keys.bound_user_id
  is '绑定账号（auth.users.id）：一码至多绑一人，CAS 抢占；撤销权益时清空';


-- ============================================================
-- 5. user_entitlements · 用户权益（「我的库」数据源）
--    kind：
--      daily_plan 每日计划解锁——每用户单条（部分唯一索引），
--                 重复兑换叠加延期（原子 upsert，见 /api/library/sync）
--      content    兑换内容——每码一条，快照商品名与兑换内容，
--                 防目标删除/改动后库里丢内容
--    expires_at：null = 永久。
--    RLS：enable 且零 policy（同卡密表，只走 service_role API）。
-- ============================================================
create table if not exists public.user_entitlements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,                        -- auth.users.id（无物理外键，用户删除不牵连）
  user_email   text,                                 -- 邮箱冗余快照（后台列表展示用）
  kind         text not null
               check (kind in ('daily_plan', 'content')),
  card_key_id  uuid references public.card_keys (id) on delete set null,
  name         text,                                 -- content 快照：商品名
  description  text,                                 -- content 快照：商品描述
  media_url    text,                                 -- content 快照：兑换内容地址
  target_type  text,                                 -- content 快照：来源目标类型（可空）
  target_id    uuid,                                 -- content 快照：来源目标 id（可空）
  unlocked_at  timestamptz not null default now(),   -- 获得时间
  expires_at   timestamptz,                          -- 到期时间；null=永久
  source       text not null default 'redeem'
               check (source in ('redeem', 'sync', 'admin'))
);

-- daily_plan：每用户单条（叠加延期 upsert 的冲突目标）
create unique index if not exists uq_entitlements_daily_single
  on public.user_entitlements (user_id)
  where kind = 'daily_plan';

-- content：同用户同码唯一（sync 幂等）
create unique index if not exists uq_entitlements_content_key
  on public.user_entitlements (user_id, card_key_id)
  where kind = 'content';

-- 按用户查「我的库」
create index if not exists idx_entitlements_user
  on public.user_entitlements (user_id);

comment on table public.user_entitlements
  is '用户权益（我的库）：daily_plan 每用户单条叠加延期；content 每码一条带快照';
comment on column public.user_entitlements.expires_at
  is '到期时间；null=永久；叠加延期必须单条原子 SQL（防并发丢延期）';
comment on column public.user_entitlements.user_email
  is '获得权益时的邮箱快照，后台列表直接用，避免逐个调 auth API';


-- ============================================================
-- 6. RLS：daily_picks / user_entitlements 开启行级安全，
--    【不创建任何 policy】→ 匿名端零读取零写入；
--    所有访问走本站 API（service_role 绕过 RLS）。
-- ============================================================
alter table public.daily_picks        enable row level security;
alter table public.user_entitlements  enable row level security;


-- ============================================================
-- 7. RPC：grant_daily_plan(用户, 邮箱, 卡密, 有效天数)
--    「每日计划」权益的原子写入（兑换 / 我的库同步共用）：
--      - 无记录：插入（expires_at = now() + 天数；天数 null = 永久）
--      - 已有记录：叠加延期，单条 SQL 防并发丢延期 ——
--          * 新码为永久（expires 传 null）→ 置永久
--          * 当前已永久 → 保持永久
--          * 否则 → greatest(当前到期, now()) + 新码天数
--    调用方（/api/redeem、/api/library/sync）已用卡密绑定做幂等门闸，
--    同一码只会成功绑定一次，故本函数无需再做同码去重。
--    返回写入后的权益行（含真实 expires_at，供接口回显）。
-- ============================================================
create or replace function public.grant_daily_plan(
  p_user_id       uuid,
  p_user_email    text,
  p_card_key_id   uuid,
  p_duration_days integer,          -- null = 永久
  p_source        text default 'redeem'   -- redeem / sync / admin
)
returns public.user_entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires timestamptz;
  v_result  public.user_entitlements;
begin
  if p_duration_days is null then
    v_expires := null;                                   -- 永久
  else
    v_expires := now() + make_interval(days => p_duration_days);
  end if;

  insert into public.user_entitlements
    (user_id, user_email, kind, card_key_id, expires_at, unlocked_at, source)
  values
    (p_user_id, p_user_email, 'daily_plan', p_card_key_id, v_expires, now(), p_source)
  on conflict (user_id) where kind = 'daily_plan'
  do update set
    expires_at = case
      -- 新码永久 → 置永久
      when excluded.expires_at is null then null
      -- 当前已永久 → 保持永久（在 DO UPDATE 中以表名引用现有行）
      when user_entitlements.expires_at is null then null
      -- 双方都有期限 → 从较晚者起叠加新码天数
      else greatest(user_entitlements.expires_at, now())
           + make_interval(days => p_duration_days)
    end,
    user_email  = excluded.user_email,
    card_key_id = excluded.card_key_id,
    source      = excluded.source
  returning * into v_result;

  return v_result;
end;
$$;

-- 仅服务端 service_role 可调用；匿名 / 公开角色一律拒绝
revoke execute on function public.grant_daily_plan(uuid, text, uuid, integer, text) from public, anon;
grant execute on function public.grant_daily_plan(uuid, text, uuid, integer, text) to service_role;

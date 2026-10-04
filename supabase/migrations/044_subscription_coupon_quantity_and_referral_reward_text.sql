-- 044: 订阅挂券支持「数量」 + 推广奖励自定义文案
--
-- 两件事，都只动配置层，不回填任何历史数据：
--
--   1. `subscription_coupons.quantity` —— 一条订阅可以给同一张券配 N 张。
--      配套把发券幂等键从「每人 + 每订阅 + 每券」细化成「每人 + 每订单 + 每券 + 第几张」：
--        · 同一笔订单重复确认（后台重试）不会重发；
--        · 用户再次购买/续费同一条订阅，会再发一轮 N 张。
--      旧行（`source_order_id` 为空）继续由同名的旧索引约束，行为不变。
--
--   2. `referral_settings.reward_text` —— 前台推广页「当前奖励」改用后台自定义文案。
--      留空时前台回退到按奖励券自动拼的句子（`ReferralClient.rewardText`），
--      不会再出现「当前奖励：50%」这种断句。
--
-- 2026-10-04 线上核对：`subscription_coupons` 0 行、`daily_picks` 0 行，
-- 所以本迁移没有历史数据需要处理；`coupon_claims` 也没有订阅发放的行。

-- ---------------------------------------------------------------- 1. 券数量

alter table public.subscription_coupons
  add column if not exists quantity integer not null default 1;

alter table public.subscription_coupons
  drop constraint if exists subscription_coupons_quantity_check;

alter table public.subscription_coupons
  add constraint subscription_coupons_quantity_check
  check (quantity between 1 and 999);

comment on column public.subscription_coupons.quantity is
  '购买这条订阅时该券发几张（迁移 044）；仍受券本身 per_user_limit / total_qty 约束，超出的部分跳过不报错';

-- 发券溯源到订单：幂等键细化到「订单 + 第几张」
alter table public.coupon_claims
  add column if not exists source_order_id uuid references public.orders (id) on delete set null,
  add column if not exists grant_seq integer not null default 1;

comment on column public.coupon_claims.source_order_id is
  '这张券由哪笔订单的「确认收款」发放（迁移 044）；NULL = 历史数据或用户自助领取';

comment on column public.coupon_claims.grant_seq is
  '同一订单、同一券的第几张（迁移 044，配合 quantity > 1）';

-- 旧索引改成只约束历史行（source_order_id 为空），名字保留 —— 服务端按名字识别"已发过"
drop index if exists public.uq_coupon_claims_from_subscription;

create unique index if not exists uq_coupon_claims_from_subscription
  on public.coupon_claims (user_id, coupon_id, source_subscription_id)
  where source_subscription_id is not null and source_order_id is null;

create unique index if not exists uq_coupon_claims_from_subscription_order
  on public.coupon_claims (user_id, coupon_id, source_subscription_id, source_order_id, grant_seq)
  where source_subscription_id is not null and source_order_id is not null;

-- 发券 RPC：多两个可选参数（订单 id + 第几张），旧的 4 参签名直接换掉，
-- 调用方只有服务端 coupons-server.ts 一处。
drop function if exists public.grant_subscription_coupon(uuid, uuid, uuid, text);

create or replace function public.grant_subscription_coupon(
  p_subscription_id uuid,
  p_coupon_id       uuid,
  p_user_id         uuid,
  p_code            text,
  p_order_id        uuid default null,
  p_seq             integer default 1
)
returns public.coupon_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon  public.coupons;
  v_claimed integer;
  v_mine    integer;
  v_claim   public.coupon_claims;
begin
  select * into v_coupon from public.coupons where id = p_coupon_id for update;
  if not found then raise exception 'COUPON_NOT_FOUND'; end if;
  if not v_coupon.enabled then raise exception 'COUPON_DISABLED'; end if;
  if v_coupon.valid_to is not null and now() > v_coupon.valid_to then
    raise exception 'COUPON_EXPIRED';
  end if;
  if not (v_coupon.allowed_scopes @> array['subscription']::text[]) then
    raise exception 'COUPON_SCOPE_MISMATCH';
  end if;

  select count(*) into v_claimed from public.coupon_claims where coupon_id = p_coupon_id;
  if v_coupon.total_qty is not null and v_claimed >= v_coupon.total_qty then
    raise exception 'COUPON_SOLD_OUT';
  end if;

  -- 数量 > 1 时逐张调用，每人限领在这里自然截断（调用方把 COUPON_LIMIT_REACHED 记成 skipped）
  select count(*) into v_mine
    from public.coupon_claims
   where coupon_id = p_coupon_id and user_id = p_user_id;
  if v_mine >= v_coupon.per_user_limit then
    raise exception 'COUPON_LIMIT_REACHED';
  end if;

  insert into public.coupon_claims (
    coupon_id, user_id, code, source_subscription_id, source_order_id, grant_seq
  )
  values (
    p_coupon_id, p_user_id, p_code, p_subscription_id, p_order_id,
    greatest(coalesce(p_seq, 1), 1)
  )
  returning * into v_claim;

  return v_claim;
end;
$$;

revoke execute on function public.grant_subscription_coupon(uuid, uuid, uuid, text, uuid, integer)
  from public, anon;
grant execute on function public.grant_subscription_coupon(uuid, uuid, uuid, text, uuid, integer)
  to service_role;

-- ---------------------------------------------------------------- 2. 推广奖励文案

alter table public.referral_settings
  add column if not exists reward_text text;

comment on column public.referral_settings.reward_text is
  '前台推广页「当前奖励」展示的自定义文案（迁移 044）；留空 = 前台按奖励券自动拼一句';

-- get_referral_overview：在 settings 里多带一个 reward_text（其余与 043 完全一致）
create or replace function public.get_referral_overview(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code public.referral_codes;
  v_settings public.referral_settings;
  v_coupon public.coupons;
begin
  select * into v_code from public.referral_codes where user_id = p_user_id;
  select * into v_settings from public.referral_settings where id = 1;
  if v_settings.reward_coupon_id is not null then
    select * into v_coupon from public.coupons where id = v_settings.reward_coupon_id;
  end if;

  return jsonb_build_object(
    'enabled', coalesce(v_settings.enabled, false),
    'share_text', coalesce(v_settings.share_text, ''),
    'code', v_code.code,
    'settings', jsonb_build_object(
      'reward_delay_hours', v_settings.reward_delay_hours,
      'require_first_order', v_settings.require_first_order,
      'min_order_amount', v_settings.min_order_amount,
      'manual_review', v_settings.manual_review,
      'reward_text', coalesce(v_settings.reward_text, '')
    ),
    'stats', jsonb_build_object(
      'invited', (select count(*) from public.referral_invites where inviter_id = p_user_id and status <> 'rejected'),
      'review', (select count(*) from public.referral_invites where inviter_id = p_user_id and status = 'review'),
      'rewarded', (select count(*) from public.referral_invites where inviter_id = p_user_id and status = 'rewarded'),
      'rejected', (select count(*) from public.referral_invites where inviter_id = p_user_id and status = 'rejected')
    ),
    'reward', case when v_coupon.id is null then null else jsonb_build_object(
      'name', v_coupon.name, 'type', v_coupon.type, 'value', v_coupon.value, 'min_amount', v_coupon.min_amount
    ) end,
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'status', i.status, 'registered_at', i.registered_at,
        'qualified_at', i.qualified_at, 'rewarded_at', i.rewarded_at,
        'rejection_reason', i.rejection_reason, 'risk_rule', i.risk_rule,
        'coupon_name', c.name
      ))
      from (
        select * from public.referral_invites
        where inviter_id = p_user_id
        order by created_at desc
        limit 10
      ) i
      left join public.coupon_claims cc on cc.source_referral_invite_id = i.id
      left join public.coupons c on c.id = cc.coupon_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_referral_overview(uuid) from public, anon;
grant execute on function public.get_referral_overview(uuid) to service_role;

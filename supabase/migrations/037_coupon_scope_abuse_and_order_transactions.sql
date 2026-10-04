-- 037: coupon usage scope / claim abuse guards / atomic order operations

alter table public.coupons
  add column if not exists allowed_scopes text[] not null default '{sub_unit,subscription}'::text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'coupons_allowed_scopes_check'
  ) then
    alter table public.coupons add constraint coupons_allowed_scopes_check
      check (
        allowed_scopes <@ array['sub_unit', 'subscription']::text[]
        and array_length(allowed_scopes, 1) > 0
      );
  end if;
end $$;

comment on column public.coupons.allowed_scopes is
  'Coupon usage scopes: sub_unit and/or subscription';

alter table public.coupon_claims
  add column if not exists ip_hash text,
  add column if not exists device_hash text;

create index if not exists idx_coupon_claims_coupon_ip_time
  on public.coupon_claims (coupon_id, ip_hash, claimed_at);
create index if not exists idx_coupon_claims_coupon_device_time
  on public.coupon_claims (coupon_id, device_hash, claimed_at);

drop function if exists public.claim_coupon(uuid, uuid, text);

create or replace function public.claim_coupon(
  p_coupon_id   uuid,
  p_user_id     uuid,
  p_code        text,
  p_ip_hash     text,
  p_device_hash text
)
returns public.coupon_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon        public.coupons;
  v_claimed       integer;
  v_mine          integer;
  v_ip_claims     integer;
  v_device_claims integer;
  v_claim         public.coupon_claims;
begin
  select * into v_coupon from public.coupons where id = p_coupon_id for update;
  if not found then raise exception 'COUPON_NOT_FOUND'; end if;
  if not v_coupon.enabled then raise exception 'COUPON_DISABLED'; end if;
  if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
    raise exception 'COUPON_NOT_STARTED';
  end if;
  if v_coupon.valid_to is not null and now() > v_coupon.valid_to then
    raise exception 'COUPON_EXPIRED';
  end if;

  select count(*) into v_claimed from public.coupon_claims where coupon_id = p_coupon_id;
  if v_coupon.total_qty is not null and v_claimed >= v_coupon.total_qty then
    raise exception 'COUPON_SOLD_OUT';
  end if;

  select count(*) into v_mine
    from public.coupon_claims
   where coupon_id = p_coupon_id and user_id = p_user_id;
  if v_mine >= v_coupon.per_user_limit then
    raise exception 'COUPON_LIMIT_REACHED';
  end if;

  if p_ip_hash is not null then
    select count(*) into v_ip_claims
      from public.coupon_claims
     where coupon_id = p_coupon_id
       and ip_hash = p_ip_hash
       and claimed_at > now() - interval '24 hours';
    if v_ip_claims >= 3 then
      raise exception 'COUPON_IP_LIMIT_REACHED';
    end if;
  end if;

  if p_device_hash is not null then
    select count(*) into v_device_claims
      from public.coupon_claims
     where coupon_id = p_coupon_id
       and device_hash = p_device_hash
       and claimed_at > now() - interval '24 hours';
    if v_device_claims >= 5 then
      raise exception 'COUPON_DEVICE_LIMIT_REACHED';
    end if;
  end if;

  insert into public.coupon_claims (
    coupon_id, user_id, code, ip_hash, device_hash
  )
  values (p_coupon_id, p_user_id, p_code, p_ip_hash, p_device_hash)
  returning * into v_claim;

  return v_claim;
end;
$$;

revoke execute on function public.claim_coupon(uuid, uuid, text, text, text)
  from public, anon;
grant execute on function public.claim_coupon(uuid, uuid, text, text, text)
  to service_role;

create or replace function public.grant_subscription_coupon(
  p_subscription_id uuid,
  p_coupon_id       uuid,
  p_user_id         uuid,
  p_code            text
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

  select count(*) into v_mine
    from public.coupon_claims
   where coupon_id = p_coupon_id and user_id = p_user_id;
  if v_mine >= v_coupon.per_user_limit then
    raise exception 'COUPON_LIMIT_REACHED';
  end if;

  insert into public.coupon_claims (
    coupon_id, user_id, code, source_subscription_id
  )
  values (p_coupon_id, p_user_id, p_code, p_subscription_id)
  returning * into v_claim;

  return v_claim;
end;
$$;

revoke execute on function public.grant_subscription_coupon(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.grant_subscription_coupon(uuid, uuid, uuid, text)
  to service_role;

create or replace function public.supersede_coupon_for_order(
  p_claim_id        uuid,
  p_holder_order_id uuid,
  p_user_id         uuid,
  p_new_order_id    uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_claim public.coupon_claims;
begin
  select * into v_order
    from public.orders
   where id = p_holder_order_id and user_id = p_user_id
   for update;
  if not found or v_order.status <> 'pending' then return false; end if;

  select * into v_claim
    from public.coupon_claims
   where id = p_claim_id and order_id = p_holder_order_id and used_at is null
   for update;
  if not found then return false; end if;

  update public.group_buy_members
     set order_id = null
   where order_id = p_holder_order_id;

  update public.orders
     set status = 'canceled', updated_at = now()
   where id = p_holder_order_id;

  update public.coupon_claims
     set order_id = p_new_order_id
   where id = p_claim_id;

  return true;
end;
$$;

revoke execute on function public.supersede_coupon_for_order(uuid, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.supersede_coupon_for_order(uuid, uuid, uuid, uuid)
  to service_role;

create or replace function public.join_group_buy(
  p_group_buy_id uuid,
  p_user_id      uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.group_buys;
  v_count integer;
begin
  select * into v_group from public.group_buys where id = p_group_buy_id for update;
  if not found then raise exception 'GROUP_BUY_NOT_FOUND'; end if;
  if v_group.status = 'expired' or now() > v_group.expires_at then
    raise exception 'GROUP_BUY_EXPIRED';
  end if;
  if v_group.status = 'closed' then raise exception 'GROUP_BUY_CLOSED'; end if;
  if v_group.status <> 'open' then raise exception 'GROUP_BUY_FULL'; end if;

  select count(*) into v_count
    from public.group_buy_members
   where group_buy_id = p_group_buy_id;
  if v_count >= v_group.target_count then raise exception 'GROUP_BUY_FULL'; end if;

  begin
    insert into public.group_buy_members (group_buy_id, user_id)
    values (p_group_buy_id, p_user_id);
  exception
    when unique_violation then raise exception 'GROUP_BUY_ALREADY_MEMBER';
  end;

  select count(*) into v_count
    from public.group_buy_members
   where group_buy_id = p_group_buy_id;

  if v_count >= v_group.target_count then
    update public.group_buys
       set status = 'full', closed_at = now()
     where id = p_group_buy_id;
  end if;

  return true;
end;
$$;

revoke execute on function public.join_group_buy(uuid, uuid) from public, anon;
grant execute on function public.join_group_buy(uuid, uuid) to service_role;

create or replace function public.create_order(
  p_order_no               text,
  p_user_id                uuid,
  p_user_email             text,
  p_total                  numeric,
  p_order_type             text,
  p_payment_method         text,
  p_coupon_code            text,
  p_discount_amount        numeric,
  p_discount_source        text,
  p_items                  jsonb,
  p_coupon_claim_id        uuid,
  p_coupon_holder_order_id uuid,
  p_group_buy_id           uuid
)
returns table(order_id uuid, order_no text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item  jsonb;
  v_index integer;
  v_group public.group_buys;
  v_claim public.coupon_claims;
begin
  if p_order_type not in ('sub_unit', 'subscription') then
    raise exception 'INVALID_ORDER_TYPE';
  end if;
  if p_payment_method not in ('wechat', 'alipay') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_ORDER_ITEMS';
  end if;
  if p_coupon_claim_id is null and p_coupon_holder_order_id is not null then
    raise exception 'INVALID_COUPON_LOCK_TARGET';
  end if;

  if p_group_buy_id is not null then
    select * into v_group from public.group_buys where id = p_group_buy_id for update;
    if not found or v_group.status <> 'full' then
      raise exception 'GROUP_BUY_NOT_FULL';
    end if;
  end if;

  insert into public.orders (
    order_no, user_id, user_email, total, type, payment_method, status,
    coupon_code, discount_amount, discount_source
  )
  values (
    p_order_no, p_user_id, p_user_email, p_total, p_order_type,
    p_payment_method, 'pending', p_coupon_code, p_discount_amount, p_discount_source
  )
  returning * into v_order;

  for v_index in 0 .. jsonb_array_length(p_items) - 1 loop
    v_item := p_items -> v_index;

    insert into public.order_items (
      order_id, line_index, line_type, ref_id, name, price, quantity, card_product_id
    )
    values (
      v_order.id,
      (v_item ->> 'line_index')::integer,
      v_item ->> 'line_type',
      (v_item ->> 'ref_id')::uuid,
      v_item ->> 'name',
      (v_item ->> 'price')::numeric,
      (v_item ->> 'quantity')::integer,
      (v_item ->> 'card_product_id')::uuid
    );

    insert into public.card_deliveries (
      order_id, card_product_id, quantity, claim_token
    )
    values (
      p_order_no || ':' || v_index,
      (v_item ->> 'card_product_id')::uuid,
      (v_item ->> 'quantity')::integer,
      v_item ->> 'claim_token'
    );
  end loop;

  if p_coupon_claim_id is not null then
    update public.coupon_claims
       set order_id = v_order.id
     where id = p_coupon_claim_id
       and order_id is null
       and used_at is null;
    if not found then raise exception 'COUPON_LOCK_FAILED'; end if;
  elsif p_coupon_holder_order_id is not null then
    select * into v_claim
      from public.coupon_claims
     where id = p_coupon_claim_id
       and order_id = p_coupon_holder_order_id
       and used_at is null
     for update;
    if not found then raise exception 'COUPON_LOCK_FAILED'; end if;

    update public.group_buy_members
       set order_id = null
     where order_id = p_coupon_holder_order_id;

    update public.orders
       set status = 'canceled', updated_at = now()
     where id = p_coupon_holder_order_id
       and user_id = p_user_id
       and status = 'pending';
    if not found then raise exception 'COUPON_LOCK_FAILED'; end if;

    update public.coupon_claims
       set order_id = v_order.id
     where id = p_coupon_claim_id;
  end if;

  if p_group_buy_id is not null then
    update public.group_buy_members
       set order_id = v_order.id
     where group_buy_id = p_group_buy_id
       and user_id = p_user_id
       and order_id is null;
    if not found then raise exception 'GROUP_BUY_ALREADY_ORDERED'; end if;
  end if;

  return query select v_order.id, v_order.order_no;
end;
$$;

revoke execute on function public.create_order(
  text, uuid, text, numeric, text, text, text, numeric, text, jsonb, uuid, uuid, uuid
) from public, anon;
grant execute on function public.create_order(
  text, uuid, text, numeric, text, text, text, numeric, text, jsonb, uuid, uuid, uuid
) to service_role;

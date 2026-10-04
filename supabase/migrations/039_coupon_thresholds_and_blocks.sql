-- 039: tighten coupon claim thresholds and add lightweight abuse blocks
--
-- Thresholds:
--   device = 1 claim / 24h
--   ip     = 2 claims / 24h
--
-- Abuse block:
--   1st violation -> 24h cooldown
--   2nd violation -> 7d cooldown
--   3rd violation -> permanent block

create table if not exists public.coupon_claim_blocks (
  id            uuid primary key default gen_random_uuid(),
  coupon_id     uuid not null references public.coupons (id) on delete cascade,
  block_key     text not null,
  strikes       integer not null default 1 check (strikes > 0),
  blocked_until timestamptz,
  permanent     boolean not null default false,
  reason        text not null check (reason in ('device_limit', 'ip_limit')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (coupon_id, block_key)
);

create index if not exists idx_coupon_claim_blocks_coupon_key
  on public.coupon_claim_blocks (coupon_id, block_key);
create index if not exists idx_coupon_claim_blocks_until
  on public.coupon_claim_blocks (blocked_until)
  where not permanent;

comment on table public.coupon_claim_blocks
  is 'Lightweight coupon abuse blocks keyed by device/IP hash';
comment on column public.coupon_claim_blocks.block_key
  is 'device:<hash> or ip:<hash>';
comment on column public.coupon_claim_blocks.strikes
  is 'Number of abuse violations after the current block expired';
comment on column public.coupon_claim_blocks.blocked_until
  is 'Cooldown end time; null when permanent';
comment on column public.coupon_claim_blocks.permanent
  is 'True after the third violation';

alter table public.coupon_claim_blocks enable row level security;

revoke all on public.coupon_claim_blocks from public, anon;
grant all on public.coupon_claim_blocks to service_role;

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
  v_coupon         public.coupons;
  v_claimed        integer;
  v_mine           integer;
  v_ip_claims      integer;
  v_device_claims  integer;
  v_claim          public.coupon_claims;
  v_block          public.coupon_claim_blocks;
  v_device_key     text;
  v_ip_key         text;
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

  if p_device_hash is not null then
    v_device_key := 'device:' || p_device_hash;
    select * into v_block
      from public.coupon_claim_blocks
     where coupon_id = p_coupon_id
       and block_key = v_device_key
       and (permanent or blocked_until > now())
     limit 1;
    if found then raise exception 'COUPON_CLAIM_BLOCKED'; end if;
  end if;

  if p_ip_hash is not null then
    v_ip_key := 'ip:' || p_ip_hash;
    select * into v_block
      from public.coupon_claim_blocks
     where coupon_id = p_coupon_id
       and block_key = v_ip_key
       and (permanent or blocked_until > now())
     limit 1;
    if found then raise exception 'COUPON_CLAIM_BLOCKED'; end if;
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
  end if;

  if p_device_hash is not null then
    select count(*) into v_device_claims
      from public.coupon_claims
     where coupon_id = p_coupon_id
       and device_hash = p_device_hash
       and claimed_at > now() - interval '24 hours';
  end if;

  if v_device_key is not null and v_device_claims >= 1 then
    insert into public.coupon_claim_blocks as existing (
      coupon_id, block_key, strikes, blocked_until, permanent, reason
    )
    values (
      p_coupon_id, v_device_key, 1, now() + interval '24 hours', false, 'device_limit'
    )
    on conflict (coupon_id, block_key) do update
      set strikes = existing.strikes + 1,
          blocked_until = case
            when existing.strikes + 1 = 2 then now() + interval '7 days'
            when existing.strikes + 1 >= 3 then null
            else now() + interval '24 hours'
          end,
          permanent = existing.strikes + 1 >= 3,
          reason = excluded.reason,
          updated_at = now();
    raise exception 'COUPON_DEVICE_LIMIT_REACHED';
  end if;

  if v_ip_key is not null and v_ip_claims >= 2 then
    insert into public.coupon_claim_blocks as existing (
      coupon_id, block_key, strikes, blocked_until, permanent, reason
    )
    values (
      p_coupon_id, v_ip_key, 1, now() + interval '24 hours', false, 'ip_limit'
    )
    on conflict (coupon_id, block_key) do update
      set strikes = existing.strikes + 1,
          blocked_until = case
            when existing.strikes + 1 = 2 then now() + interval '7 days'
            when existing.strikes + 1 >= 3 then null
            else now() + interval '24 hours'
          end,
          permanent = existing.strikes + 1 >= 3,
          reason = excluded.reason,
          updated_at = now();
    raise exception 'COUPON_IP_LIMIT_REACHED';
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

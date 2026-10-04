-- 042: referral program with abuse controls and idempotent coupon rewards

create table if not exists public.referral_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  reward_coupon_id uuid references public.coupons (id) on delete set null,
  reward_delay_hours integer not null default 72 check (reward_delay_hours between 0 and 720),
  require_email_verified boolean not null default true,
  require_first_order boolean not null default false,
  min_order_amount numeric(10,2) not null default 0 check (min_order_amount >= 0),
  per_inviter_limit integer not null default 20 check (per_inviter_limit between 1 and 10000),
  per_device_limit integer not null default 3 check (per_device_limit between 1 and 1000),
  per_ip_limit integer not null default 5 check (per_ip_limit between 1 and 1000),
  manual_review boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.referral_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  code text not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references auth.users (id) on delete cascade,
  invitee_id uuid not null unique references auth.users (id) on delete cascade,
  code text not null,
  status text not null default 'registered' check (status in ('registered', 'review', 'rewarded', 'rejected')),
  registered_at timestamptz not null default now(),
  qualified_at timestamptz,
  rewarded_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  invitee_ip_hash text,
  invitee_device_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_referral_invites_inviter_status on public.referral_invites (inviter_id, status);
create index if not exists idx_referral_invites_device on public.referral_invites (inviter_id, invitee_device_hash);
create index if not exists idx_referral_invites_ip on public.referral_invites (inviter_id, invitee_ip_hash);
create index if not exists idx_referral_invites_due on public.referral_invites (status, registered_at);

create table if not exists public.referral_events (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid references public.referral_invites (id) on delete cascade,
  event_type text not null check (event_type in ('registered', 'review', 'rewarded', 'rejected')),
  message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_referral_events_invite_time on public.referral_events (invite_id, created_at desc);

alter table public.coupon_claims
  add column if not exists source_referral_invite_id uuid references public.referral_invites (id) on delete set null;

create unique index if not exists uq_coupon_claims_from_referral
  on public.coupon_claims (source_referral_invite_id)
  where source_referral_invite_id is not null;

comment on table public.referral_settings is 'Referral program configuration and abuse thresholds';
comment on table public.referral_codes is 'One stable referral code per user';
comment on table public.referral_invites is 'Inviter/invitee binding, risk fingerprints, and reward lifecycle';
comment on column public.coupon_claims.source_referral_invite_id is 'Coupon issued by this referral invite; partial unique index makes issuance idempotent';

create or replace function public.get_or_create_referral_code(p_user_id uuid)
returns public.referral_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.referral_codes;
  v_code text;
begin
  select * into v_row from public.referral_codes where user_id = p_user_id for update;
  if found then return v_row; end if;

  for v_attempt in 1..5 loop
    v_code := 'ZV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    begin
      insert into public.referral_codes (user_id, code)
      values (p_user_id, v_code)
      returning * into v_row;
      return v_row;
    exception when unique_violation then
      if sqlerrm ilike '%referral_codes_code_key%' then
        continue;
      else
        raise;
      end if;
    end;
  end loop;

  raise exception 'REFERRAL_CODE_GENERATION_FAILED';
end;
$$;
create or replace function public.bind_referral_invite(
  p_code text,
  p_invitee_id uuid,
  p_invitee_email text,
  p_ip_hash text,
  p_device_hash text
)
returns public.referral_invites
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_settings public.referral_settings;
  v_code public.referral_codes;
  v_invitee auth.users;
  v_count integer;
  v_row public.referral_invites;
begin
  select * into v_settings from public.referral_settings where id = 1 for update;
  if not found or not v_settings.enabled then
    raise exception 'REFERRAL_DISABLED';
  end if;

  select * into v_code
  from public.referral_codes
  where code = upper(p_code) and enabled
  for update;
  if not found then raise exception 'REFERRAL_CODE_NOT_FOUND'; end if;
  if v_code.user_id = p_invitee_id then
    raise exception 'REFERRAL_SELF_INVITE';
  end if;

  select * into v_invitee from auth.users where id = p_invitee_id;
  if not found then raise exception 'INVITEE_NOT_FOUND'; end if;
  if p_invitee_email is not null and lower(coalesce(v_invitee.email, '')) <> lower(p_invitee_email) then
    raise exception 'INVITEE_EMAIL_MISMATCH';
  end if;

  select count(*) into v_count from public.referral_invites where invitee_id = p_invitee_id;
  if v_count > 0 then raise exception 'REFERRAL_ALREADY_BOUND'; end if;

  select count(*) into v_count
  from public.referral_invites
  where inviter_id = v_code.user_id and status <> 'rejected';
  if v_count >= v_settings.per_inviter_limit then
    raise exception 'REFERRAL_INVITER_LIMIT';
  end if;

  if p_device_hash is not null then
    select count(*) into v_count
    from public.referral_invites
    where inviter_id = v_code.user_id
      and invitee_device_hash = p_device_hash
      and status <> 'rejected';
    if v_count >= v_settings.per_device_limit then
      raise exception 'REFERRAL_DEVICE_LIMIT';
    end if;
  end if;

  if p_ip_hash is not null then
    select count(*) into v_count
    from public.referral_invites
    where inviter_id = v_code.user_id
      and invitee_ip_hash = p_ip_hash
      and status <> 'rejected';
    if v_count >= v_settings.per_ip_limit then
      raise exception 'REFERRAL_IP_LIMIT';
    end if;
  end if;

  insert into public.referral_invites (
    inviter_id, invitee_id, code, invitee_ip_hash, invitee_device_hash
  )
  values (
    v_code.user_id, p_invitee_id, v_code.code, p_ip_hash, p_device_hash
  )
  returning * into v_row;

  insert into public.referral_events (invite_id, event_type, message)
  values (v_row.id, 'registered', '新账号已绑定推广关系');
  return v_row;
end;
$$;

create or replace function public.grant_referral_coupon(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.referral_settings;
  v_invite public.referral_invites;
  v_coupon public.coupons;
  v_claimed integer;
  v_mine integer;
  v_code text;
begin
  select * into v_settings from public.referral_settings where id = 1 for update;
  if not found or not v_settings.enabled or v_settings.reward_coupon_id is null then
    raise exception 'REFERRAL_REWARD_NOT_CONFIGURED';
  end if;

  select * into v_invite
  from public.referral_invites
  where id = p_invite_id and status = 'review'
  for update;
  if not found then raise exception 'INVALID_REFERRAL_STATE'; end if;

  select * into v_coupon
  from public.coupons
  where id = v_settings.reward_coupon_id
  for update;
  if not found then raise exception 'REFERRAL_COUPON_NOT_FOUND'; end if;
  if not v_coupon.enabled then raise exception 'REFERRAL_COUPON_DISABLED'; end if;
  if v_coupon.valid_to is not null and now() > v_coupon.valid_to then
    raise exception 'REFERRAL_COUPON_EXPIRED';
  end if;

  select count(*) into v_claimed from public.coupon_claims where coupon_id = v_coupon.id;
  if v_coupon.total_qty is not null and v_claimed >= v_coupon.total_qty then
    raise exception 'REFERRAL_COUPON_SOLD_OUT';
  end if;

  select count(*) into v_mine
  from public.coupon_claims
  where coupon_id = v_coupon.id and user_id = v_invite.inviter_id;
  if v_mine >= v_coupon.per_user_limit then
    raise exception 'REFERRAL_COUPON_LIMIT';
  end if;

  for v_attempt in 1..5 loop
    v_code := 'RF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    begin
      insert into public.coupon_claims (
        coupon_id, user_id, code, ip_hash, device_hash, source_referral_invite_id
      )
      values (
        v_coupon.id,
        v_invite.inviter_id,
        v_code,
        v_invite.invitee_ip_hash,
        v_invite.invitee_device_hash,
        v_invite.id
      );
      update public.referral_invites
      set status = 'rewarded', rewarded_at = now(), updated_at = now()
      where id = v_invite.id;
      insert into public.referral_events (invite_id, event_type, message)
      values (v_invite.id, 'rewarded', '推广奖励已发放');
      return true;
    exception when unique_violation then
      if sqlerrm ilike '%coupon_claims_code_key%' then
        continue;
      elsif sqlerrm ilike '%uq_coupon_claims_from_referral%' then
        return true;
      else
        raise;
      end if;
    end;
  end loop;

  raise exception 'REFERRAL_COUPON_CODE_FAILED';
end;
$$;
create or replace function public.process_referral_rewards()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_settings public.referral_settings;
  v_invite record;
  v_user auth.users;
  v_count integer;
  v_has_order boolean;
  v_processed integer := 0;
begin
  select * into v_settings from public.referral_settings where id = 1;
  if not found or not v_settings.enabled or v_settings.reward_coupon_id is null then
    return 0;
  end if;

  for v_invite in
    select *
    from public.referral_invites
    where status = 'registered'
    order by registered_at, id
    for update skip locked
  loop
    if v_invite.registered_at + (v_settings.reward_delay_hours * interval '1 hour') > now() then
      continue;
    end if;

    select * into v_user from auth.users where id = v_invite.invitee_id;
    if v_settings.require_email_verified and v_user.email_confirmed_at is null then
      continue;
    end if;

    if v_settings.require_first_order then
      select exists (
        select 1
        from public.orders
        where user_id = v_invite.invitee_id
          and status = 'paid'
          and greatest(total - discount_amount, 0) >= v_settings.min_order_amount
      ) into v_has_order;
      if not v_has_order then continue; end if;
    end if;

    select count(*) into v_count
    from public.referral_invites
    where inviter_id = v_invite.inviter_id and status = 'rewarded';
    if v_count >= v_settings.per_inviter_limit then
      update public.referral_invites
      set status = 'rejected', rejected_at = now(), rejection_reason = 'inviter_limit', updated_at = now()
      where id = v_invite.id;
      insert into public.referral_events (invite_id, event_type, message)
      values (v_invite.id, 'rejected', '超过推广人奖励上限');
      v_processed := v_processed + 1;
      continue;
    end if;

    if v_invite.invitee_device_hash is not null then
      select count(*) into v_count
      from public.referral_invites
      where inviter_id = v_invite.inviter_id
        and invitee_device_hash = v_invite.invitee_device_hash
        and status <> 'rejected';
      if v_count > v_settings.per_device_limit then
        update public.referral_invites
        set status = 'rejected', rejected_at = now(), rejection_reason = 'device_limit', updated_at = now()
        where id = v_invite.id;
        insert into public.referral_events (invite_id, event_type, message)
        values (v_invite.id, 'rejected', '同设备邀请超过阈值');
        v_processed := v_processed + 1;
        continue;
      end if;
    end if;

    if v_invite.invitee_ip_hash is not null then
      select count(*) into v_count
      from public.referral_invites
      where inviter_id = v_invite.inviter_id
        and invitee_ip_hash = v_invite.invitee_ip_hash
        and status <> 'rejected';
      if v_count > v_settings.per_ip_limit then
        update public.referral_invites
        set status = 'rejected', rejected_at = now(), rejection_reason = 'ip_limit', updated_at = now()
        where id = v_invite.id;
        insert into public.referral_events (invite_id, event_type, message)
        values (v_invite.id, 'rejected', '同 IP 邀请超过阈值');
        v_processed := v_processed + 1;
        continue;
      end if;
    end if;

    if v_settings.manual_review then
      update public.referral_invites
      set status = 'review', qualified_at = now(), updated_at = now()
      where id = v_invite.id;
      insert into public.referral_events (invite_id, event_type, message)
      values (v_invite.id, 'review', '满足条件，等待人工审核');
      v_processed := v_processed + 1;
    else
      begin
        update public.referral_invites
        set status = 'review', qualified_at = now(), updated_at = now()
        where id = v_invite.id;
        perform public.grant_referral_coupon(v_invite.id);
        v_processed := v_processed + 1;
      exception when others then
        update public.referral_invites
        set status = 'rejected', rejected_at = now(), rejection_reason = left(sqlerrm, 500), updated_at = now()
        where id = v_invite.id;
        insert into public.referral_events (invite_id, event_type, message)
        values (v_invite.id, 'rejected', left(sqlerrm, 500));
      end;
    end if;
  end loop;

  return v_processed;
end;
$$;

create or replace function public.admin_update_referral_invite(
  p_id uuid,
  p_action text,
  p_reason text default null
)
returns public.referral_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.referral_invites;
begin
  if p_action = 'approve' then
    select * into v_row
    from public.referral_invites
    where id = p_id and status = 'review'
    for update;
    if not found then raise exception 'INVALID_REFERRAL_STATE'; end if;
    perform public.grant_referral_coupon(p_id);
    select * into v_row from public.referral_invites where id = p_id;
    return v_row;
  elsif p_action = 'reject' then
    update public.referral_invites
    set status = 'rejected', rejected_at = now(),
        rejection_reason = coalesce(nullif(p_reason, ''), 'manual_reject'), updated_at = now()
    where id = p_id and status in ('registered', 'review')
    returning * into v_row;
    if not found then raise exception 'INVALID_REFERRAL_STATE'; end if;
    insert into public.referral_events (invite_id, event_type, message)
    values (v_row.id, 'rejected', coalesce(nullif(p_reason, ''), '人工拒绝'));
    return v_row;
  end if;

  raise exception 'INVALID_ACTION';
end;
$$;

create or replace function public.get_referral_overview(p_user_id uuid)
returns jsonb
language plpgsql
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
    'code', v_code.code,
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
        'rewarded_at', i.rewarded_at, 'coupon_name', c.name
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

alter table public.referral_settings enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referral_invites enable row level security;
alter table public.referral_events enable row level security;

revoke all on public.referral_settings, public.referral_codes,
  public.referral_invites, public.referral_events
  from public, anon;
grant all on public.referral_settings, public.referral_codes,
  public.referral_invites, public.referral_events
  to service_role;

revoke execute on function public.get_or_create_referral_code(uuid) from public, anon;
revoke execute on function public.bind_referral_invite(text, uuid, text, text, text) from public, anon;
revoke execute on function public.grant_referral_coupon(uuid) from public, anon;
revoke execute on function public.process_referral_rewards() from public, anon;
revoke execute on function public.admin_update_referral_invite(uuid, text, text) from public, anon;
revoke execute on function public.get_referral_overview(uuid) from public, anon;
grant execute on function public.get_or_create_referral_code(uuid) to service_role;
grant execute on function public.bind_referral_invite(text, uuid, text, text, text) to service_role;
grant execute on function public.grant_referral_coupon(uuid) to service_role;
grant execute on function public.process_referral_rewards() to service_role;
grant execute on function public.admin_update_referral_invite(uuid, text, text) to service_role;
grant execute on function public.get_referral_overview(uuid) to service_role;

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron unavailable; use the manual referral runner API';
end $$;

do $$
begin
  if to_regclass('cron.job') is not null then
    if not exists (select 1 from cron.job where jobname = 'zorvin-process-referral-rewards') then
      perform cron.schedule(
        'zorvin-process-referral-rewards',
        '* * * * *',
        'select public.process_referral_rewards();'
      );
    end if;
  end if;
end $$;

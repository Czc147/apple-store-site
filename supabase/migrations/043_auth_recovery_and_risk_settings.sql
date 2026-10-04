-- 043: no-email auth recovery, configurable coupon risk, scoped bans, referral transparency

-- Registration / referral flows no longer require email confirmation.
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_action_check;
alter table public.admin_audit_logs
  add constraint admin_audit_logs_action_check
  check (action in ('set_status', 'set_role', 'set_note', 'password_reset_bot'));

-- Referral share copy and review metadata
alter table public.referral_settings
  add column if not exists share_text text not null default
    '我在 ZORVIN 发现了一个很高级的数字内容商店，用我的专属链接注册即可领取新人奖励：{link}';

alter table public.referral_settings
  alter column require_email_verified set default false;

update public.referral_settings
  set require_email_verified = false, updated_at = now()
  where id = 1;

alter table public.referral_invites
  add column if not exists risk_rule text,
  add column if not exists review_note text,
  add column if not exists processed_by text;

-- Global coupon claim risk settings. Values can be overridden per coupon when allowed.
create table if not exists public.coupon_risk_settings (
  id                         smallint primary key default 1 check (id = 1),
  enabled                    boolean not null default true,
  window_hours               integer not null default 24 check (window_hours between 1 and 720),
  device_limit               integer not null default 1 check (device_limit between 1 and 1000),
  ip_limit                   integer not null default 2 check (ip_limit between 1 and 1000),
  new_account_cooldown_hours integer not null default 0 check (new_account_cooldown_hours between 0 and 720),
  first_strike_hours         integer not null default 24 check (first_strike_hours between 1 and 720),
  second_strike_days         integer not null default 7 check (second_strike_days between 1 and 60),
  permanent_strikes          integer not null default 3 check (permanent_strikes between 2 and 10),
  allow_coupon_override      boolean not null default false,
  updated_at                 timestamptz not null default now()
);

insert into public.coupon_risk_settings (id) values (1) on conflict (id) do nothing;

alter table public.coupons
  add column if not exists risk_override_enabled boolean not null default false,
  add column if not exists risk_device_limit integer,
  add column if not exists risk_ip_limit integer,
  add column if not exists risk_new_account_cooldown_hours integer;

-- Coarse login history used only by the password-reset robot.
create table if not exists public.auth_login_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  device_type text not null check (device_type in ('ios', 'android', 'windows', 'macos', 'other')),
  region      text not null,
  ip_hash     text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_auth_login_events_user_time
  on public.auth_login_events (user_id, created_at desc);

create table if not exists public.password_reset_attempts (
  id         uuid primary key default gen_random_uuid(),
  email_hash text not null,
  ip_hash    text not null,
  success    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_attempts_time
  on public.password_reset_attempts (created_at desc);

create table if not exists public.account_restrictions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  scope      text not null check (scope in ('login', 'coupon', 'referral')),
  kind       text not null check (kind in ('temporary', 'permanent')),
  reason     text not null,
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  active     boolean not null default true,
  created_by text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_account_restrictions_active_scope
  on public.account_restrictions (user_id, scope) where active;

create index if not exists idx_account_restrictions_user_scope
  on public.account_restrictions (user_id, scope, active);

alter table public.coupon_risk_settings enable row level security;
alter table public.auth_login_events enable row level security;
alter table public.password_reset_attempts enable row level security;
alter table public.account_restrictions enable row level security;

revoke all on public.coupon_risk_settings,
  public.auth_login_events,
  public.password_reset_attempts,
  public.account_restrictions
  from public, anon;

grant all on public.coupon_risk_settings,
  public.auth_login_events,
  public.password_reset_attempts,
  public.account_restrictions
  to service_role;

create or replace function public.has_active_account_restriction(
  p_user_id uuid,
  p_scope text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_restrictions
    where user_id = p_user_id
      and scope = p_scope
      and active
      and starts_at <= now()
      and (kind = 'permanent' or ends_at > now())
  );
$$;

revoke execute on function public.has_active_account_restriction(uuid, text)
  from public, anon;
grant execute on function public.has_active_account_restriction(uuid, text)
  to service_role;

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
set search_path = public, auth
as $$
declare
  v_coupon       public.coupons;
  v_risk         public.coupon_risk_settings;
  v_claimed      integer;
  v_mine         integer;
  v_ip_claims    integer;
  v_device_claims integer;
  v_claim        public.coupon_claims;
  v_block        public.coupon_claim_blocks;
  v_device_key   text;
  v_ip_key       text;
  v_device_limit integer;
  v_ip_limit     integer;
  v_cooldown     interval;
  v_user_created timestamptz;
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

  select * into v_risk from public.coupon_risk_settings where id = 1;
  if not found or not v_risk.enabled then
    v_device_limit := null;
    v_ip_limit := null;
    v_cooldown := null;
  else
    v_device_limit := v_risk.device_limit;
    v_ip_limit := v_risk.ip_limit;
    v_cooldown := make_interval(hours => v_risk.new_account_cooldown_hours);

    if v_risk.allow_coupon_override and v_coupon.risk_override_enabled then
      if v_coupon.risk_device_limit is not null then
        v_device_limit := greatest(1, v_coupon.risk_device_limit);
      end if;
      if v_coupon.risk_ip_limit is not null then
        v_ip_limit := greatest(1, v_coupon.risk_ip_limit);
      end if;
      if v_coupon.risk_new_account_cooldown_hours is not null then
        v_cooldown := make_interval(hours => v_coupon.risk_new_account_cooldown_hours);
      end if;
    end if;
  end if;

  if v_cooldown is not null then
    select created_at into v_user_created from auth.users where id = p_user_id;
    if v_user_created is not null and v_user_created + v_cooldown > now() then
      raise exception 'COUPON_ACCOUNT_COOLDOWN';
    end if;
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

  if v_ip_limit is not null and p_ip_hash is not null then
    select count(*) into v_ip_claims
      from public.coupon_claims
     where coupon_id = p_coupon_id
       and ip_hash = p_ip_hash
       and claimed_at > now() - make_interval(hours => v_risk.window_hours);
  end if;

  if v_device_limit is not null and p_device_hash is not null then
    select count(*) into v_device_claims
      from public.coupon_claims
     where coupon_id = p_coupon_id
       and device_hash = p_device_hash
       and claimed_at > now() - make_interval(hours => v_risk.window_hours);
  end if;

  if v_device_key is not null and v_device_limit is not null and v_device_claims >= v_device_limit then
    insert into public.coupon_claim_blocks as existing (
      coupon_id, block_key, strikes, blocked_until, permanent, reason
    )
    values (
      p_coupon_id, v_device_key, 1,
      now() + make_interval(hours => v_risk.first_strike_hours), false, 'device_limit'
    )
    on conflict (coupon_id, block_key) do update
      set strikes = existing.strikes + 1,
          blocked_until = case
            when existing.strikes + 1 >= v_risk.permanent_strikes then null
            when existing.strikes + 1 = 2 then now() + make_interval(days => v_risk.second_strike_days)
            else now() + make_interval(hours => v_risk.first_strike_hours)
          end,
          permanent = existing.strikes + 1 >= v_risk.permanent_strikes,
          reason = excluded.reason,
          updated_at = now();
    raise exception 'COUPON_DEVICE_LIMIT_REACHED';
  end if;

  if v_ip_key is not null and v_ip_limit is not null and v_ip_claims >= v_ip_limit then
    insert into public.coupon_claim_blocks as existing (
      coupon_id, block_key, strikes, blocked_until, permanent, reason
    )
    values (
      p_coupon_id, v_ip_key, 1,
      now() + make_interval(hours => v_risk.first_strike_hours), false, 'ip_limit'
    )
    on conflict (coupon_id, block_key) do update
      set strikes = existing.strikes + 1,
          blocked_until = case
            when existing.strikes + 1 >= v_risk.permanent_strikes then null
            when existing.strikes + 1 = 2 then now() + make_interval(days => v_risk.second_strike_days)
            else now() + make_interval(hours => v_risk.first_strike_hours)
          end,
          permanent = existing.strikes + 1 >= v_risk.permanent_strikes,
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

create or replace function public.process_referral_rewards()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_settings public.referral_settings;
  v_invite record;
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

    if public.has_active_account_restriction(v_invite.inviter_id, 'referral') then
      update public.referral_invites
      set status = 'rejected', rejected_at = now(), rejection_reason = 'referral_restriction',
          risk_rule = 'referral_restriction', updated_at = now()
      where id = v_invite.id;
      insert into public.referral_events (invite_id, event_type, message)
      values (v_invite.id, 'rejected', '推广人奖励权限受限');
      v_processed := v_processed + 1;
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
      set status = 'rejected', rejected_at = now(), rejection_reason = 'inviter_limit',
          risk_rule = 'inviter_limit', updated_at = now()
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
        set status = 'rejected', rejected_at = now(), rejection_reason = 'device_limit',
            risk_rule = 'device_limit', updated_at = now()
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
        set status = 'rejected', rejected_at = now(), rejection_reason = 'ip_limit',
            risk_rule = 'ip_limit', updated_at = now()
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
        set status = 'rejected', rejected_at = now(), rejection_reason = left(sqlerrm, 500),
            risk_rule = 'reward_failed', updated_at = now()
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
  v_inviter_id uuid;
begin
  if p_action = 'approve' then
    select inviter_id into v_inviter_id
    from public.referral_invites
    where id = p_id;
    if public.has_active_account_restriction(v_inviter_id, 'referral') then
      raise exception 'REFERRAL_INVITER_RESTRICTED';
    end if;
    update public.referral_invites
    set status = 'review', qualified_at = now(), updated_at = now()
    where id = p_id and status = 'review'
    returning * into v_row;
    if not found then raise exception 'INVALID_REFERRAL_STATE'; end if;
    perform public.grant_referral_coupon(p_id);
    update public.referral_invites
    set processed_by = 'admin', updated_at = now()
    where id = p_id;
    select * into v_row from public.referral_invites where id = p_id;
    return v_row;
  elsif p_action = 'reject' then
    update public.referral_invites
    set status = 'rejected', rejected_at = now(),
        rejection_reason = coalesce(nullif(p_reason, ''), 'manual_reject'),
        risk_rule = 'manual_reject',
        review_note = nullif(p_reason, ''),
        processed_by = 'admin', updated_at = now()
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
      'manual_review', v_settings.manual_review
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

revoke execute on function public.process_referral_rewards() from public, anon;
revoke execute on function public.admin_update_referral_invite(uuid, text, text) from public, anon;
revoke execute on function public.get_referral_overview(uuid) from public, anon;

grant execute on function public.process_referral_rewards() to service_role;
grant execute on function public.admin_update_referral_invite(uuid, text, text) to service_role;
grant execute on function public.get_referral_overview(uuid) to service_role;

-- Defense in depth: even an admin approval cannot grant a reward while the
-- inviter has an active referral-scope restriction.
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

  if public.has_active_account_restriction(v_invite.inviter_id, 'referral') then
    update public.referral_invites
    set status = 'rejected', rejected_at = now(), rejection_reason = 'referral_restriction',
        risk_rule = 'referral_restriction', updated_at = now()
    where id = v_invite.id;
    insert into public.referral_events (invite_id, event_type, message)
    values (v_invite.id, 'rejected', '推广人奖励权限受限');
    return false;
  end if;

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

revoke execute on function public.grant_referral_coupon(uuid) from public, anon;
grant execute on function public.grant_referral_coupon(uuid) to service_role;

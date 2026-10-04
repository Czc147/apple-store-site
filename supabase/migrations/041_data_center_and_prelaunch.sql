-- 041: data center metrics + scheduled publication queue

alter table public.sub_units
  add column if not exists enabled boolean not null default true;
alter table public.activities
  add column if not exists enabled boolean not null default true;
alter table public.daily_picks
  add column if not exists enabled boolean not null default true;
alter table public.subscriptions
  add column if not exists enabled boolean not null default true;

create index if not exists idx_sub_units_enabled
  on public.sub_units (enabled);
create index if not exists idx_activities_enabled
  on public.activities (enabled);
create index if not exists idx_daily_picks_enabled
  on public.daily_picks (enabled);
create index if not exists idx_subscriptions_enabled
  on public.subscriptions (enabled);

create table if not exists public.scheduled_publications (
  id           uuid primary key default gen_random_uuid(),
  target_type  text not null
               check (target_type in ('sub_unit', 'activity', 'subscription', 'coupon', 'home_section', 'daily_pick')),
  target_id    uuid not null,
  action       text not null
               check (action in ('publish', 'unpublish')),
  scheduled_at timestamptz not null,
  status       text not null default 'pending'
               check (status in ('pending', 'published', 'failed', 'canceled')),
  attempts     integer not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz
);

create unique index if not exists uq_scheduled_publications_pending
  on public.scheduled_publications (target_type, target_id, action)
  where status = 'pending';
create index if not exists idx_scheduled_publications_due
  on public.scheduled_publications (status, scheduled_at);

create table if not exists public.publication_logs (
  id              uuid primary key default gen_random_uuid(),
  publication_id  uuid not null references public.scheduled_publications (id) on delete cascade,
  status          text not null
                  check (status in ('pending', 'published', 'failed', 'canceled')),
  message         text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_publication_logs_publication_time
  on public.publication_logs (publication_id, created_at desc);

create or replace function public.create_scheduled_publication(
  p_target_type text,
  p_target_id uuid,
  p_action text,
  p_scheduled_at timestamptz,
  p_hide_now boolean default false
)
returns public.scheduled_publications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.scheduled_publications;
begin
  if p_action = 'publish' and p_hide_now then
    case p_target_type
      when 'sub_unit' then
        update public.sub_units set enabled = false where id = p_target_id;
      when 'activity' then
        update public.activities set enabled = false where id = p_target_id;
      when 'subscription' then
        update public.subscriptions set enabled = false where id = p_target_id;
      when 'coupon' then
        update public.coupons set enabled = false where id = p_target_id;
      when 'home_section' then
        update public.home_sections set enabled = false where id = p_target_id;
      when 'daily_pick' then
        update public.daily_picks set enabled = false, updated_at = now() where id = p_target_id;
      else
        raise exception 'INVALID_TARGET_TYPE';
    end case;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
  else
    if not exists (
      select 1
      from public.sub_units
      where p_target_type = 'sub_unit' and id = p_target_id
      union all
      select 1
      from public.activities
      where p_target_type = 'activity' and id = p_target_id
      union all
      select 1
      from public.subscriptions
      where p_target_type = 'subscription' and id = p_target_id
      union all
      select 1
      from public.coupons
      where p_target_type = 'coupon' and id = p_target_id
      union all
      select 1
      from public.home_sections
      where p_target_type = 'home_section' and id = p_target_id
      union all
      select 1
      from public.daily_picks
      where p_target_type = 'daily_pick' and id = p_target_id
    ) then
      raise exception 'TARGET_NOT_FOUND';
    end if;
  end if;

  insert into public.scheduled_publications (target_type, target_id, action, scheduled_at)
  values (p_target_type, p_target_id, p_action, p_scheduled_at)
  returning * into v_row;

  insert into public.publication_logs (publication_id, status, message)
  values (v_row.id, 'pending', '预上线任务已创建');
  return v_row;
end;
$$;

create or replace function public.process_scheduled_publications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select *
    from public.scheduled_publications
    where status = 'pending' and scheduled_at <= now()
    order by scheduled_at, id
    for update skip locked
  loop
    begin
      case v_row.target_type
        when 'sub_unit' then
          update public.sub_units set enabled = (v_row.action = 'publish') where id = v_row.target_id;
        when 'activity' then
          update public.activities set enabled = (v_row.action = 'publish') where id = v_row.target_id;
        when 'subscription' then
          update public.subscriptions set enabled = (v_row.action = 'publish') where id = v_row.target_id;
        when 'coupon' then
          update public.coupons set enabled = (v_row.action = 'publish') where id = v_row.target_id;
        when 'home_section' then
          update public.home_sections set enabled = (v_row.action = 'publish') where id = v_row.target_id;
        when 'daily_pick' then
          update public.daily_picks
          set enabled = (v_row.action = 'publish'), updated_at = now()
          where id = v_row.target_id;
        else
          raise exception 'INVALID_TARGET_TYPE';
      end case;

      if not found then raise exception 'TARGET_NOT_FOUND'; end if;

      update public.scheduled_publications
      set status = 'published',
          attempts = attempts + 1,
          last_error = null,
          published_at = now(),
          updated_at = now()
      where id = v_row.id;

      insert into public.publication_logs (publication_id, status, message)
      values (v_row.id, 'published', '内容已按计划处理');
      v_count := v_count + 1;
    exception when others then
      update public.scheduled_publications
      set status = 'failed',
          attempts = attempts + 1,
          last_error = left(SQLERRM, 500),
          updated_at = now()
      where id = v_row.id;

      insert into public.publication_logs (publication_id, status, message)
      values (v_row.id, 'failed', left(SQLERRM, 500));
    end;
  end loop;
  return v_count;
end;
$$;

create or replace function public.admin_update_scheduled_publication(
  p_id uuid,
  p_action text
)
returns public.scheduled_publications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.scheduled_publications;
begin
  case p_action
    when 'cancel' then
      update public.scheduled_publications
      set status = 'canceled', updated_at = now()
      where id = p_id and status = 'pending'
      returning * into v_row;
    when 'retry' then
      update public.scheduled_publications
      set status = 'pending', scheduled_at = now(), last_error = null, updated_at = now()
      where id = p_id and status = 'failed'
      returning * into v_row;
    when 'run_now' then
      update public.scheduled_publications
      set status = 'pending', scheduled_at = now(), last_error = null, updated_at = now()
      where id = p_id and status in ('pending', 'failed')
      returning * into v_row;
    else
      raise exception 'INVALID_ACTION';
  end case;

  if not found then raise exception 'INVALID_STATE'; end if;

  insert into public.publication_logs (publication_id, status, message)
  values (
    v_row.id,
    v_row.status,
    case p_action
      when 'cancel' then '预上线任务已取消'
      when 'retry' then '失败任务已重试'
      else '任务已改为立即执行'
    end
  );
  return v_row;
end;
$$;

create or replace function public.admin_data_center_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_today date := (now() at time zone 'Asia/Shanghai')::date;
  v_today_start timestamptz := v_today::timestamp at time zone 'Asia/Shanghai';
begin
  return jsonb_build_object(
    'generated_at', now(),
    'orders', jsonb_build_object(
      'total', (select count(*) from public.orders),
      'paid', (select count(*) from public.orders where status = 'paid'),
      'pending', (select count(*) from public.orders where status = 'pending'),
      'canceled', (select count(*) from public.orders where status = 'canceled'),
      'today', (select count(*) from public.orders where created_at >= v_today_start),
      'last_7_days', (select count(*) from public.orders where created_at >= v_today_start - interval '6 days'),
      'last_30_days', (select count(*) from public.orders where created_at >= v_today_start - interval '29 days'),
      'total_revenue', (select coalesce(sum(greatest(total - discount_amount, 0)), 0) from public.orders where status = 'paid'),
      'today_revenue', (select coalesce(sum(greatest(total - discount_amount, 0)), 0) from public.orders where status = 'paid' and paid_at >= v_today_start),
      'last_7_days_revenue', (select coalesce(sum(greatest(total - discount_amount, 0)), 0) from public.orders where status = 'paid' and paid_at >= v_today_start - interval '6 days'),
      'last_30_days_revenue', (select coalesce(sum(greatest(total - discount_amount, 0)), 0) from public.orders where status = 'paid' and paid_at >= v_today_start - interval '29 days'),
      'aov', (
        select coalesce(sum(greatest(total - discount_amount, 0)) / nullif(count(*), 0), 0)
        from public.orders where status = 'paid'
      )
    ),
    'users', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'today_new', (select count(*) from auth.users where created_at >= v_today_start),
      'last_7_days_new', (select count(*) from auth.users where created_at >= v_today_start - interval '6 days'),
      'recent', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ru.id,
          'email', ru.email,
          'display_name', coalesce(ru.display_name, split_part(ru.email, '@', 1), '用户'),
          'avatar_key', ru.avatar_key,
          'avatar_url', ru.avatar_url,
          'last_active_at', ru.last_active_at
        ))
        from (
          select u.id, u.email, u.last_sign_in_at, u.created_at,
                 coalesce(u.last_sign_in_at, u.created_at) as last_active_at,
                 p.display_name, p.avatar_key, p.avatar_url
          from auth.users u
          left join public.profiles p on p.user_id = u.id
          order by coalesce(u.last_sign_in_at, u.created_at) desc
          limit 5
        ) ru
      ), '[]'::jsonb)
    ),
    'coupons', jsonb_build_object(
      'claimed', (select count(*) from public.coupon_claims),
      'used', (select count(*) from public.coupon_claims where used_at is not null),
      'locked', (select count(*) from public.coupon_claims where used_at is null and order_id is not null),
      'redemption_rate', (
        select coalesce(round(count(*) filter (where used_at is not null) * 100.0 / nullif(count(*), 0), 2), 0)
        from public.coupon_claims
      ),
      'discount_total', (select coalesce(sum(discount_amount), 0) from public.orders where status = 'paid')
    ),
    'content', jsonb_build_object(
      'sub_units', (select count(*) from public.sub_units),
      'visible_sub_units', (select count(*) from public.sub_units where enabled),
      'activities', (select count(*) from public.activities),
      'visible_activities', (select count(*) from public.activities where enabled),
      'subscriptions', (select count(*) from public.subscriptions),
      'visible_subscriptions', (select count(*) from public.subscriptions where enabled),
      'daily_picks', (select count(*) from public.daily_picks),
      'visible_daily_picks', (select count(*) from public.daily_picks where enabled),
      'entitlements', (select count(*) from public.user_entitlements)
    ),
    'publications', jsonb_build_object(
      'pending', (select count(*) from public.scheduled_publications where status = 'pending'),
      'published', (select count(*) from public.scheduled_publications where status = 'published'),
      'failed', (select count(*) from public.scheduled_publications where status = 'failed'),
      'canceled', (select count(*) from public.scheduled_publications where status = 'canceled')
    ),
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', to_char(d.day::date, 'YYYY-MM-DD'),
        'orders', (select count(*) from public.orders o where o.created_at at time zone 'Asia/Shanghai' = d.day::date),
        'revenue', (
          select coalesce(sum(greatest(o.total - o.discount_amount, 0)), 0)
          from public.orders o
          where o.status = 'paid' and o.paid_at at time zone 'Asia/Shanghai' = d.day::date
        ),
        'new_users', (select count(*) from auth.users u where u.created_at at time zone 'Asia/Shanghai' = d.day::date)
      ))
      from generate_series(v_today - 29, v_today, interval '1 day') as d(day)
    ), '[]'::jsonb)
  );
end;
$$;

alter table public.scheduled_publications enable row level security;
alter table public.publication_logs enable row level security;

revoke all on public.scheduled_publications from public, anon;
revoke all on public.publication_logs from public, anon;
grant all on public.scheduled_publications to service_role;
grant all on public.publication_logs to service_role;

revoke execute on function public.create_scheduled_publication(text, uuid, text, timestamptz, boolean) from public, anon;
revoke execute on function public.process_scheduled_publications() from public, anon;
revoke execute on function public.admin_update_scheduled_publication(uuid, text) from public, anon;
revoke execute on function public.admin_data_center_stats() from public, anon;
grant execute on function public.create_scheduled_publication(text, uuid, text, timestamptz, boolean) to service_role;
grant execute on function public.process_scheduled_publications() to service_role;
grant execute on function public.admin_update_scheduled_publication(uuid, text) to service_role;
grant execute on function public.admin_data_center_stats() to service_role;

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron unavailable; use the manual publication runner API';
end $$;

do $$
begin
  if to_regclass('cron.job') is not null then
    if not exists (select 1 from cron.job where jobname = 'zorvin-process-publications') then
      perform cron.schedule(
        'zorvin-process-publications',
        '* * * * *',
        'select public.process_scheduled_publications();'
      );
    end if;
  end if;
end $$;

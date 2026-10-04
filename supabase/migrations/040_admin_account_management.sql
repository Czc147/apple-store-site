-- 040: admin account management P0 — profile notes + audit log

alter table public.profiles
  add column if not exists account_note text;

comment on column public.profiles.account_note
  is 'Admin-only note for this account';

create table if not exists public.admin_audit_logs (
  id             uuid primary key default gen_random_uuid(),
  operator       text not null default 'admin',
  target_user_id uuid not null,
  action         text not null
                 check (action in ('set_status', 'set_role', 'set_note')),
  before_state   jsonb not null default '{}'::jsonb,
  after_state    jsonb not null default '{}'::jsonb,
  reason         text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_admin_audit_logs_target_time
  on public.admin_audit_logs (target_user_id, created_at desc);

comment on table public.admin_audit_logs
  is 'Admin actions affecting user accounts';
comment on column public.admin_audit_logs.before_state
  is 'Public-safe state snapshot before the change';
comment on column public.admin_audit_logs.after_state
  is 'Public-safe state snapshot after the change';

alter table public.admin_audit_logs enable row level security;

revoke all on public.admin_audit_logs from public, anon;
grant all on public.admin_audit_logs to service_role;

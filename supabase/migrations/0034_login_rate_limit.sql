-- Additive: login_attempts table for IP+email rate-limiting on sign-in.
-- Does NOT alter any existing table, RLS policy, or function.

create table public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip_address text not null,
  attempt_type text not null default 'signin',
  success boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_login_attempts_email_created
  on public.login_attempts(email, created_at desc);

create index idx_login_attempts_ip_created
  on public.login_attempts(ip_address, created_at desc);

-- RLS enabled but table is accessed only by server-side code via service_role
-- (createAdminClient), which bypasses RLS. These policies ensure the anon
-- role and authenticated client users CANNOT read or write this table.
alter table public.login_attempts enable row level security;

create policy "service_role_only — no anon reads"
  on public.login_attempts for select
  using (false);

create policy "service_role_only — no anon inserts"
  on public.login_attempts for insert
  with check (false);

create policy "service_role_only — no anon deletes"
  on public.login_attempts for delete
  using (false);

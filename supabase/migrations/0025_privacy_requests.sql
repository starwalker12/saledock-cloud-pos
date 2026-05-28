-- Migration 0025: Privacy requests table for in-app Privacy Center.
--
-- This table tracks data access, export, correction, deletion, restriction,
-- portability, and objection requests submitted by authenticated users.
-- No actual deletion of user/org data happens in this migration — it only
-- creates the request tracking system. Processing happens in a future release.

-- ── Table ───────────────────────────────────────────────────────────────────────

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  requester_email text,
  requester_name text,
  request_type text not null,
  status text not null default 'pending',
  details jsonb not null default '{}'::jsonb,
  admin_notes text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint privacy_requests_request_type_check
    check (request_type in ('access', 'export', 'correction', 'deletion', 'restriction', 'portability', 'objection')),

  constraint privacy_requests_status_check
    check (status in ('pending', 'in_review', 'completed', 'rejected', 'cancelled'))
);

-- ── Indexes ─────────────────────────────────────────────────────────────────────

create index idx_privacy_requests_user on public.privacy_requests(requester_user_id);
create index idx_privacy_requests_org on public.privacy_requests(organization_id);
create index idx_privacy_requests_status on public.privacy_requests(status);
create index idx_privacy_requests_type on public.privacy_requests(request_type);
create index idx_privacy_requests_requested_at on public.privacy_requests(requested_at desc);

-- ── Trigger for updated_at ──────────────────────────────────────────────────────

create trigger set_privacy_requests_updated_at
  before update on public.privacy_requests
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────────

alter table public.privacy_requests enable row level security;

-- Authenticated users can insert their own requests only
drop policy if exists "Users can insert their own privacy requests" on public.privacy_requests;
create policy "Users can insert their own privacy requests"
  on public.privacy_requests for insert
  to authenticated
  with check (requester_user_id = auth.uid());

-- Authenticated users can view their own requests
drop policy if exists "Users can view their own privacy requests" on public.privacy_requests;
create policy "Users can view their own privacy requests"
  on public.privacy_requests for select
  to authenticated
  using (requester_user_id = auth.uid());

-- Authenticated users can cancel their own pending/in_review requests
drop policy if exists "Users can cancel their own pending privacy requests" on public.privacy_requests;
create policy "Users can cancel their own pending privacy requests"
  on public.privacy_requests for update
  to authenticated
  using (requester_user_id = auth.uid() and status in ('pending', 'in_review'))
  with check (requester_user_id = auth.uid() and status = 'cancelled');

-- Platform admins can select all requests (server-side only, guarded by requirePlatformAdmin)
drop policy if exists "Platform admins can view all privacy requests" on public.privacy_requests;
create policy "Platform admins can view all privacy requests"
  on public.privacy_requests for select
  to authenticated
  using (
    exists (
      select 1 from public.platform_admins
      where user_id = auth.uid() and is_active = true
    )
  );

-- Platform admins can update any request (server-side only)
drop policy if exists "Platform admins can update privacy requests" on public.privacy_requests;
create policy "Platform admins can update privacy requests"
  on public.privacy_requests for update
  to authenticated
  using (
    exists (
      select 1 from public.platform_admins
      where user_id = auth.uid() and is_active = true
    )
  );

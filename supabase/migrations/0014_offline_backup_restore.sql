-- Migration 0014: Offline Backup ZIP Import / Restore Schema
-- Creates additive tables for tracking desktop SQLite import jobs and key row mappings.

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete restrict,
  imported_by uuid references public.profiles(id) on delete set null,
  source_app text not null default 'GadgetZonePOS',
  source_backup_version text,
  source_schema_version text,
  manifest jsonb not null default '{}'::jsonb,
  status text not null default 'previewed' check (status in ('previewed', 'importing', 'completed', 'failed', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.import_row_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  source_table text not null,
  source_id text not null,
  target_table text not null,
  target_id uuid not null,
  source_hash text,
  created_at timestamptz not null default now(),
  unique (organization_id, import_job_id, source_table, source_id)
);

-- Enable RLS
alter table public.import_jobs enable row level security;
alter table public.import_row_mappings enable row level security;

-- Create Policies using public.current_organization_id()
create policy "Org scoped import jobs access"
on public.import_jobs for all
to authenticated
using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

create policy "Org scoped import row mappings access"
on public.import_row_mappings for all
to authenticated
using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

-- Create Indexes
create index if not exists idx_import_jobs_org
  on public.import_jobs(organization_id, created_at desc);

create index if not exists idx_import_row_mappings_lookup
  on public.import_row_mappings(organization_id, import_job_id, source_table, source_id);

-- Updated_at trigger
drop trigger if exists set_import_jobs_updated_at on public.import_jobs;
create trigger set_import_jobs_updated_at
before update on public.import_jobs
for each row execute function public.set_updated_at();

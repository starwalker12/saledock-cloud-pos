-- Review-first migration: save owner onboarding progress between sessions.
-- This does not create shops, branches, profiles, or any money/business data.

create table if not exists public.onboarding_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  current_step text not null default 'profile'
    check (current_step in ('profile', 'shop', 'branch', 'branding', 'confirm')),
  completed_steps text[] not null default '{}'::text[],
  draft_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(draft_data) = 'object'),
  status text not null default 'draft'
    check (status in ('draft', 'completed', 'abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_onboarding_drafts_status
  on public.onboarding_drafts (status);

create index if not exists idx_onboarding_drafts_updated_at
  on public.onboarding_drafts (updated_at desc);

create or replace function public.tg_onboarding_drafts_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_onboarding_drafts_updated_at on public.onboarding_drafts;
create trigger set_onboarding_drafts_updated_at
  before update on public.onboarding_drafts
  for each row
  execute function public.tg_onboarding_drafts_set_updated_at();

alter table public.onboarding_drafts enable row level security;

drop policy if exists "Users can select their own onboarding draft" on public.onboarding_drafts;
create policy "Users can select their own onboarding draft"
  on public.onboarding_drafts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own onboarding draft" on public.onboarding_drafts;
create policy "Users can insert their own onboarding draft"
  on public.onboarding_drafts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own onboarding draft" on public.onboarding_drafts;
create policy "Users can update their own onboarding draft"
  on public.onboarding_drafts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own onboarding draft" on public.onboarding_drafts;
create policy "Users can delete their own onboarding draft"
  on public.onboarding_drafts
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.onboarding_drafts to authenticated;

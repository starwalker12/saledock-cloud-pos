-- Migration: Proper staff invitation lifecycle table
--
-- This table replaces the implicit invite state that was previously inferred
-- from auth.users.invited_at / email_confirmed_at. It gives the app an explicit,
-- auditable, revocable invitation lifecycle tied to one shop.
--
-- Status flow:
--   pending  -> accepted
--   pending  -> declined
--   pending  -> revoked   (owner/admin cancels before acceptance)
--   pending  -> expired   (past expires_at, set by application logic or cleanup)
--
-- SAFETY: This migration only adds a new table. It does not modify existing
-- profiles, organizations, money, stock, invoices, reports, or calculations.

-- ── Enum for invitation status ──────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'staff_invitation_status'
  ) then
    create type public.staff_invitation_status as enum (
      'pending',
      'accepted',
      'declined',
      'revoked',
      'expired'
    );
  end if;
end
$$;

-- ── Table ───────────────────────────────────────────────────────────────────────

create table if not exists public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.user_role not null,
  branch_id uuid null references public.branches(id) on delete set null,
  permissions jsonb null default null,
  status public.staff_invitation_status not null default 'pending',

  -- Who sent the invite.
  invited_by uuid not null references public.profiles(id) on delete cascade,

  -- Supabase auth user created by admin.auth.admin.inviteUserByEmail, if any.
  invited_auth_user_id uuid null,

  -- Auth user who accepted the invite (should match invited email).
  accepted_auth_user_id uuid null,

  -- One-time lookup token. Store SHA-256 hash; raw token lives only in the
  -- invite email URL and is never logged or returned to the client.
  token_hash text null unique,

  sent_at timestamptz null,
  accepted_at timestamptz null,
  declined_at timestamptz null,
  revoked_at timestamptz null,
  expires_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Only one invite row per organization + email. This keeps the lifecycle
  -- simple and auditable: resending updates the existing pending row instead
  -- of creating duplicates. Historical states are tracked via status columns
  -- and timestamps, not by multiple rows.
  constraint uq_staff_invitations_org_email
    unique (organization_id, lower(email))
);

-- ── Indexes ─────────────────────────────────────────────────────────────────────

create index if not exists idx_staff_invitations_org_status
  on public.staff_invitations(organization_id, status);

create index if not exists idx_staff_invitations_email
  on public.staff_invitations(lower(email));

create index if not exists idx_staff_invitations_token_hash
  on public.staff_invitations(token_hash)
  where token_hash is not null;

create index if not exists idx_staff_invitations_invited_auth_user
  on public.staff_invitations(invited_auth_user_id)
  where invited_auth_user_id is not null;

-- ── Trigger for updated_at ──────────────────────────────────────────────────────

drop trigger if exists set_staff_invitations_updated_at on public.staff_invitations;
create trigger set_staff_invitations_updated_at
  before update on public.staff_invitations
  for each row execute function public.set_updated_at();

-- ── Trigger to enforce branch belongs to same organization ──────────────────────

-- CHECK constraints cannot contain subqueries, so we use a BEFORE trigger.
create or replace function public.tg_staff_invitations_branch_same_org()
returns trigger as $$
begin
  if new.branch_id is not null then
    if not exists (
      select 1 from public.branches b
      where b.id = new.branch_id and b.organization_id = new.organization_id
    ) then
      raise exception 'Branch % does not belong to organization %', new.branch_id, new.organization_id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists staff_invitations_branch_same_org on public.staff_invitations;
create trigger staff_invitations_branch_same_org
  before insert or update on public.staff_invitations
  for each row execute function public.tg_staff_invitations_branch_same_org();

-- ── RLS ─────────────────────────────────────────────────────────────────────────

alter table public.staff_invitations enable row level security;

-- Helper function: is the current user an owner/admin of the given organization?
create or replace function public.is_org_manager(org_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid()
      and organization_id = org_id
      and role in ('owner', 'admin')
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- SELECT: owner/admin of the organization, or the invitee reading their own
-- pending invite during acceptance. Public/casual users cannot list invites.
drop policy if exists "Staff invitations org select" on public.staff_invitations;
create policy "Staff invitations org select"
  on public.staff_invitations for select
  to authenticated
  using (
    lower(email) = lower((select au.email from auth.users au where au.id = auth.uid()))
    or public.is_org_manager(organization_id)
  );

-- INSERT: only owner/admin of the target organization.
drop policy if exists "Staff invitations org insert" on public.staff_invitations;
create policy "Staff invitations org insert"
  on public.staff_invitations for insert
  to authenticated
  with check (public.is_org_manager(organization_id));

-- UPDATE: only owner/admin of the target organization. Invitee updates (accept/decline)
-- are performed through service-role server actions so the row can be locked and validated.
drop policy if exists "Staff invitations org update" on public.staff_invitations;
create policy "Staff invitations org update"
  on public.staff_invitations for update
  to authenticated
  using (public.is_org_manager(organization_id))
  with check (public.is_org_manager(organization_id));

-- DELETE: only owner/admin of the target organization.
drop policy if exists "Staff invitations org delete" on public.staff_invitations;
create policy "Staff invitations org delete"
  on public.staff_invitations for delete
  to authenticated
  using (public.is_org_manager(organization_id));

-- Service role can do everything (used for server actions that need strict
-- validation/auditing). This is the default for service_role when RLS is on,
-- but we make it explicit for documentation.
drop policy if exists "Staff invitations service role all" on public.staff_invitations;
create policy "Staff invitations service role all"
  on public.staff_invitations for all
  to service_role
  using (true)
  with check (true);

-- Migration 0028: Cash Shifts / Daily Cash Drawer System
--
-- Tracks cash drawer shifts within a day. Multiple shifts can exist per day
-- (morning/evening or cashier handover). Independent of daily_closings — shifts
-- are intra-day operational records, while daily_closings remains the end-of-day
-- financial rollup.
--
-- Shift totals (cash, digital, credit, etc.) are computed server-side by
-- timestamp range (opened_at → closed_at/now), NOT by storing a shift_id on
-- invoices. This avoids a migration on the invoices table for V1.

-- ── Table ───────────────────────────────────────────────────────────────────────

create table public.cash_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by uuid not null references public.profiles(id) on delete set null,
  closed_by uuid references public.profiles(id) on delete set null,
  starting_cash numeric(12,2) not null default 0,
  expected_cash numeric(12,2) not null default 0,
  counted_cash numeric(12,2),
  cash_difference numeric(12,2),
  notes text,
  status text not null default 'open'::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cash_shifts_status_check check (status in ('open', 'closed'))
);

-- ── Indexes ─────────────────────────────────────────────────────────────────────

-- Enforce exactly one open shift per branch at any time
create unique index idx_cash_shifts_one_open_per_branch
  on public.cash_shifts(organization_id, branch_id)
  where status = 'open';

-- Fast lookup by org + branch + status (for "is there an open shift?")
create index idx_cash_shifts_org_branch_status
  on public.cash_shifts(organization_id, branch_id, status);

-- Fast ordering by open time for shift history
create index idx_cash_shifts_org_branch_opened
  on public.cash_shifts(organization_id, branch_id, opened_at desc);

-- ── Trigger for updated_at ──────────────────────────────────────────────────────

create trigger set_cash_shifts_updated_at
  before update on public.cash_shifts
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────────

alter table public.cash_shifts enable row level security;

create policy "Org scoped cash shifts access"
  on public.cash_shifts for all
  to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

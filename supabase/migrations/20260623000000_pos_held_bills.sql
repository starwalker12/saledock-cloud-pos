-- Migration: POS held bills / suspended sales
--
-- Adds a lightweight table for carts that are paused mid-sale.
-- Held bills are organization-scoped, have NO invoice number, do NOT reserve stock,
-- and do NOT affect customer balances, cash drawer, or reports.
-- Real invoice numbers (INV-*) are generated only by the final pos_checkout RPC.

create table if not exists public.pos_held_bills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  status text not null default 'held' check (status in ('held', 'resumed', 'completed', 'cancelled')),
  label text,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  note text,
  cart jsonb not null,
  totals_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resumed_at timestamptz,
  completed_invoice_id uuid references public.invoices(id) on delete set null
);

comment on table public.pos_held_bills is 'Paused POS carts. No invoice number, no stock reservation, no ledger impact.';
comment on column public.pos_held_bills.cart is 'Snapshot of the held cart in checkout-schema shape.';
comment on column public.pos_held_bills.totals_snapshot is 'Display-only totals for the held-bills list.';
comment on column public.pos_held_bills.status is 'held = active suspended; resumed = loaded back into POS; completed = checked out; cancelled = discarded.';

alter table public.pos_held_bills enable row level security;

-- Index for listing held bills per org quickly.
create index if not exists idx_pos_held_bills_org_status on public.pos_held_bills (organization_id, status, updated_at desc);

-- Updated-at trigger using the shared set_updated_at function.
drop trigger if exists set_pos_held_bills_updated_at on public.pos_held_bills;
create trigger set_pos_held_bills_updated_at
  before update on public.pos_held_bills
  for each row execute function public.set_updated_at();

-- RLS policies: org-scoped access for authenticated users.
drop policy if exists "Org scoped held bill select" on public.pos_held_bills;
create policy "Org scoped held bill select"
  on public.pos_held_bills for select
  to authenticated
  using (organization_id = public.current_organization_id());

drop policy if exists "Org scoped held bill insert" on public.pos_held_bills;
create policy "Org scoped held bill insert"
  on public.pos_held_bills for insert
  to authenticated
  with check (organization_id = public.current_organization_id());

drop policy if exists "Org scoped held bill update" on public.pos_held_bills;
create policy "Org scoped held bill update"
  on public.pos_held_bills for update
  to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

drop policy if exists "Org scoped held bill delete" on public.pos_held_bills;
create policy "Org scoped held bill delete"
  on public.pos_held_bills for delete
  to authenticated
  using (organization_id = public.current_organization_id());

-- Grants follow existing convention: service role for admin operations, authenticated for app.
grant select, insert, update, delete on public.pos_held_bills to authenticated;
grant select, insert, update, delete on public.pos_held_bills to service_role;

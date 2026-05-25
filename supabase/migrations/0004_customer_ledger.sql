-- Migration 0004: Customer Ledger Foundation
-- Adds double-entry customer ledger logging, running balance cache, and RLS policies.

create type public.ledger_entry_type as enum ('charge', 'payment', 'adjustment', 'refund');

-- Add outstanding_balance column to customers to cache current open balance
alter table public.customers add column outstanding_balance numeric(12,2) not null default 0;

create table public.customer_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  type public.ledger_entry_type not null,
  amount numeric(12,2) not null,
  running_balance numeric(12,2) not null,
  invoice_id uuid references public.invoices(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Indexing for ledger analysis and sorting
create index idx_customer_ledger_cust_created on public.customer_ledger_entries(customer_id, created_at desc);
create index idx_customer_ledger_org on public.customer_ledger_entries(organization_id);

-- Enable Row Level Security
alter table public.customer_ledger_entries enable row level security;

-- Scoped RLS Policy
create policy "Org scoped customer ledger access"
on public.customer_ledger_entries for all
to authenticated
using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

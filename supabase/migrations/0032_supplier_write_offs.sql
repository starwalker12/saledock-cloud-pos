-- Migration 0032: Supplier Write-Offs
--
-- Adds the ability for owner/admin to forgive (write off) part or all of a
-- supplier's outstanding balance. A write-off is NOT an expense — it clears
-- a payable (liability) without affecting profit, COGS, stock, or inventory.
-- Mirror of the customer write-off feature (0026_customer_settlement_accounting.sql).
--
-- supplier_ledger_entries.entry_type already allows 'adjustment' (from 0016),
-- so no CHECK constraint changes are needed.

-- 1. Create supplier_write_offs table (mirrors customer_write_offs)
create table public.supplier_write_offs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  reason text not null,
  written_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_supplier_write_offs_supplier on public.supplier_write_offs(supplier_id);
create index idx_supplier_write_offs_org on public.supplier_write_offs(organization_id);

create trigger set_supplier_write_offs_updated_at
  before update on public.supplier_write_offs
  for each row execute function public.set_updated_at();

alter table public.supplier_write_offs enable row level security;

create policy "Org scoped supplier write-offs access"
  on public.supplier_write_offs for all
  to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

-- 2. RPC: record_supplier_write_off (mirrors record_customer_write_off)
create or replace function public.record_supplier_write_off(
  p_supplier_id uuid,
  p_branch_id uuid,
  p_amount numeric,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_profile_id uuid;
  v_branch_id uuid;
  v_curr_balance numeric;
  v_balance_after numeric;
  v_write_off_id uuid := gen_random_uuid();
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '28000'; end if;

  select id, organization_id, branch_id
    into v_profile_id, v_org_id, v_branch_id
    from public.profiles
    where id = v_user_id and is_active = true;
  if v_org_id is null then raise exception 'No active profile' using errcode = 'P0001'; end if;

  if p_branch_id is not null then v_branch_id := p_branch_id; end if;
  if v_branch_id is null then raise exception 'No branch assigned for this user' using errcode = 'P0001'; end if;

  -- Only owner and admin can write off (managers excluded)
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and role in ('owner', 'admin')
  ) then
    raise exception 'Only owner or admin can write off supplier dues' using errcode = 'P0001';
  end if;

  -- Lock supplier row
  select outstanding_balance into v_curr_balance
    from public.suppliers
    where id = p_supplier_id and organization_id = v_org_id
    for update;
  if not found then raise exception 'Supplier not found' using errcode = 'P0001'; end if;

  if p_amount <= 0 then raise exception 'Write-off amount must be positive' using errcode = 'P0001'; end if;
  if p_amount > coalesce(v_curr_balance, 0) + 0.0001 then
    raise exception 'Write-off amount exceeds outstanding balance' using errcode = 'P0001';
  end if;

  v_balance_after := coalesce(v_curr_balance, 0) - p_amount;

  -- Update supplier outstanding balance
  update public.suppliers
    set outstanding_balance = v_balance_after
    where id = p_supplier_id;

  -- Insert into supplier_write_offs
  insert into public.supplier_write_offs (
    id, organization_id, branch_id, supplier_id, amount, reason, written_by
  ) values (
    v_write_off_id, v_org_id, v_branch_id, p_supplier_id, p_amount, p_reason, v_profile_id
  );

  -- Insert into supplier_ledger_entries
  insert into public.supplier_ledger_entries (
    organization_id, branch_id, supplier_id, entry_type, direction,
    amount, balance_after, description, created_by
  ) values (
    v_org_id, v_branch_id, p_supplier_id, 'adjustment', 'debit',
    p_amount, v_balance_after, 'Write-off: ' || p_reason, v_profile_id
  );
end;
$$;

grant execute on function public.record_supplier_write_off(uuid, uuid, numeric, text) to authenticated;

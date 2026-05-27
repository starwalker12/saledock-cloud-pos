-- Migration 0016: Supplier Purchases + Supplier Ledger
-- Adds stock purchases workflow: recording goods received from suppliers,
-- creating stock lots atomically, tracking supplier dues, and recording
-- supplier payments. Stock purchases are NOT expenses; they affect inventory
-- value (and COGS once sold via FIFO).

------------------------------------------------------------------------------
-- 1. Supplier outstanding balance (mirrors customers.outstanding_balance)
------------------------------------------------------------------------------
alter table public.suppliers
  add column if not exists outstanding_balance numeric(12,2) not null default 0;

------------------------------------------------------------------------------
-- 2. supplier_purchases
------------------------------------------------------------------------------
create table public.supplier_purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_no text not null,
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid')),
  purchase_date date not null default current_date,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  grand_total numeric(12,2) not null default 0 check (grand_total >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  balance_due numeric(12,2) not null default 0 check (balance_due >= 0),
  reference_no text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, purchase_no)
);

------------------------------------------------------------------------------
-- 3. supplier_purchase_items
------------------------------------------------------------------------------
create table public.supplier_purchase_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_id uuid not null references public.supplier_purchases(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  stock_lot_id uuid references public.product_stock_lots(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

------------------------------------------------------------------------------
-- 4. supplier_payments
------------------------------------------------------------------------------
create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_id uuid references public.supplier_purchases(id) on delete set null,
  method public.payment_method not null,
  amount numeric(12,2) not null check (amount > 0),
  reference_no text,
  note text,
  paid_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------------------
-- 5. supplier_ledger_entries
------------------------------------------------------------------------------
create table public.supplier_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  purchase_id uuid references public.supplier_purchases(id) on delete set null,
  payment_id uuid references public.supplier_payments(id) on delete set null,
  entry_type text not null check (entry_type in ('purchase_credit','payment_debit','adjustment')),
  direction text not null check (direction in ('credit','debit')),
  amount numeric(12,2) not null check (amount >= 0),
  balance_after numeric(12,2) not null,
  description text,
  reference_number text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------------------
-- 6. Indexes
------------------------------------------------------------------------------
create index idx_supplier_purchases_org on public.supplier_purchases(organization_id);
create index idx_supplier_purchases_supplier_date on public.supplier_purchases(supplier_id, purchase_date desc);
create index idx_supplier_purchases_status on public.supplier_purchases(organization_id, status);
create index idx_supplier_purchase_items_purchase on public.supplier_purchase_items(purchase_id);
create index idx_supplier_purchase_items_org on public.supplier_purchase_items(organization_id);
create index idx_supplier_payments_org on public.supplier_payments(organization_id);
create index idx_supplier_payments_supplier on public.supplier_payments(supplier_id, paid_at desc);
create index idx_supplier_payments_purchase on public.supplier_payments(purchase_id);
create index idx_supplier_ledger_supplier_created on public.supplier_ledger_entries(supplier_id, created_at desc);
create index idx_supplier_ledger_org on public.supplier_ledger_entries(organization_id);

------------------------------------------------------------------------------
-- 7. Triggers
------------------------------------------------------------------------------
create trigger set_supplier_purchases_updated_at before update on public.supplier_purchases
  for each row execute function public.set_updated_at();
create trigger set_supplier_payments_updated_at before update on public.supplier_payments
  for each row execute function public.set_updated_at();
create trigger set_supplier_ledger_updated_at before update on public.supplier_ledger_entries
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------------
-- 8. RLS
------------------------------------------------------------------------------
alter table public.supplier_purchases enable row level security;
alter table public.supplier_purchase_items enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.supplier_ledger_entries enable row level security;

create policy "Org scoped supplier purchases access"
  on public.supplier_purchases for all to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "Org scoped supplier purchase items access"
  on public.supplier_purchase_items for all to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "Org scoped supplier payments access"
  on public.supplier_payments for all to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "Org scoped supplier ledger access"
  on public.supplier_ledger_entries for all to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

------------------------------------------------------------------------------
-- 9. RPC: create_supplier_purchase
--   Records a goods-received purchase atomically:
--     * inserts supplier_purchases header + supplier_purchase_items rows
--     * creates a product_stock_lot per item (FIFO source)
--     * records stock_movements ('purchase')
--     * increments products.stock_quantity
--     * logs supplier_ledger_entries (purchase_credit + optional payment_debit)
--     * increments suppliers.outstanding_balance by (grand_total - amount_paid)
--     * optionally records an initial supplier_payments row
--   p_items jsonb format: [{product_id, quantity, unit_cost, notes}]
------------------------------------------------------------------------------
create or replace function public.create_supplier_purchase(
  p_supplier_id uuid,
  p_branch_id uuid,
  p_purchase_date date,
  p_items jsonb,
  p_discount_total numeric,
  p_reference_no text,
  p_notes text,
  p_payment_method public.payment_method,
  p_amount_paid numeric,
  p_payment_ref text
)
returns table(purchase_id uuid, purchase_no text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_profile_id uuid;
  v_branch_id uuid;
  v_purchase_id uuid := gen_random_uuid();
  v_purchase_no text;
  v_seq int;
  v_subtotal numeric := 0;
  v_grand numeric;
  v_balance numeric;
  v_item jsonb;
  v_product record;
  v_qty int;
  v_unit_cost numeric;
  v_line_total numeric;
  v_status text;
  v_lot_id uuid;
  v_item_id uuid;
  v_supplier_balance numeric;
  v_payment_id uuid;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '28000'; end if;

  select id, organization_id, branch_id
    into v_profile_id, v_org_id, v_branch_id
    from public.profiles
    where id = v_user_id and is_active = true;
  if v_org_id is null then raise exception 'No active profile' using errcode = 'P0001'; end if;

  if p_branch_id is not null then v_branch_id := p_branch_id; end if;
  if v_branch_id is null then raise exception 'No branch assigned for this user' using errcode = 'P0001'; end if;

  perform 1 from public.suppliers
    where id = p_supplier_id and organization_id = v_org_id for update;
  if not found then raise exception 'Supplier not found' using errcode = 'P0001'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Purchase must include at least one item' using errcode = 'P0001';
  end if;

  -- Serialize purchase number generation per organization
  perform 1 from public.organizations where id = v_org_id for update;

  select coalesce(
    max(nullif(regexp_replace(purchase_no, '\D', '', 'g'), '')::int),
    0
  ) + 1
    into v_seq
    from public.supplier_purchases
    where organization_id = v_org_id;
  v_purchase_no := 'PUR-' || lpad(v_seq::text, 6, '0');

  -- First pass: validate and accumulate subtotal
  for v_item in select * from jsonb_array_elements(p_items) loop
    select id, name, type, is_active
      into v_product
      from public.products
      where id = (v_item->>'product_id')::uuid and organization_id = v_org_id
      for update;
    if not found then raise exception 'Product not in catalog' using errcode = 'P0001'; end if;
    if not v_product.is_active then
      raise exception 'Product not available: %', v_product.name using errcode = 'P0001';
    end if;
    if v_product.type <> 'product' then
      raise exception 'Cannot purchase stock for non-product item: %', v_product.name using errcode = 'P0001';
    end if;

    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 then raise exception 'Invalid quantity for %', v_product.name using errcode = 'P0001'; end if;

    v_unit_cost := coalesce(nullif(v_item->>'unit_cost','')::numeric, 0);
    if v_unit_cost < 0 then raise exception 'Negative unit cost for %', v_product.name using errcode = 'P0001'; end if;

    v_line_total := v_unit_cost * v_qty;
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  v_grand := greatest(v_subtotal - coalesce(p_discount_total, 0), 0);
  if coalesce(p_amount_paid, 0) < 0 then
    raise exception 'Amount paid cannot be negative' using errcode = 'P0001';
  end if;
  if coalesce(p_amount_paid, 0) > v_grand then
    raise exception 'Amount paid cannot exceed grand total' using errcode = 'P0001';
  end if;
  v_balance := greatest(v_grand - coalesce(p_amount_paid, 0), 0);

  v_status := case
    when v_grand = 0 then 'paid'
    when coalesce(p_amount_paid, 0) >= v_grand then 'paid'
    when coalesce(p_amount_paid, 0) > 0 then 'partial'
    else 'unpaid'
  end;

  insert into public.supplier_purchases (
    id, organization_id, branch_id, supplier_id, purchase_no, status,
    purchase_date, subtotal, discount_total, grand_total, amount_paid, balance_due,
    reference_no, notes, created_by
  ) values (
    v_purchase_id, v_org_id, v_branch_id, p_supplier_id, v_purchase_no, v_status,
    coalesce(p_purchase_date, current_date), v_subtotal, coalesce(p_discount_total, 0),
    v_grand, coalesce(p_amount_paid, 0), v_balance,
    nullif(p_reference_no, ''), nullif(p_notes, ''), v_profile_id
  );

  -- Second pass: create lot + movement + line item + bump product stock
  for v_item in select * from jsonb_array_elements(p_items) loop
    select id, name
      into v_product
      from public.products
      where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_unit_cost := coalesce(nullif(v_item->>'unit_cost','')::numeric, 0);
    v_line_total := v_unit_cost * v_qty;
    v_lot_id := gen_random_uuid();
    v_item_id := gen_random_uuid();

    insert into public.product_stock_lots (
      id, organization_id, branch_id, product_id, supplier_id, lot_number,
      purchase_date, quantity_received, quantity_remaining, unit_cost, notes, created_by
    ) values (
      v_lot_id, v_org_id, v_branch_id, v_product.id, p_supplier_id, v_purchase_no,
      coalesce(p_purchase_date, current_date), v_qty, v_qty, v_unit_cost,
      nullif(v_item->>'notes', ''), v_profile_id
    );

    insert into public.stock_movements (
      organization_id, branch_id, product_id, stock_lot_id, movement_type,
      quantity, unit_cost, reference_type, reference_id, notes, created_by
    ) values (
      v_org_id, v_branch_id, v_product.id, v_lot_id, 'purchase',
      v_qty, v_unit_cost, 'supplier_purchase', v_purchase_id,
      'Supplier purchase ' || v_purchase_no, v_profile_id
    );

    insert into public.supplier_purchase_items (
      id, organization_id, purchase_id, product_id, product_name,
      quantity, unit_cost, line_total, stock_lot_id, notes
    ) values (
      v_item_id, v_org_id, v_purchase_id, v_product.id, v_product.name,
      v_qty, v_unit_cost, v_line_total, v_lot_id, nullif(v_item->>'notes', '')
    );

    update public.products
      set stock_quantity = stock_quantity + v_qty
      where id = v_product.id;
  end loop;

  -- Update supplier outstanding balance (locked above)
  select outstanding_balance into v_supplier_balance
    from public.suppliers where id = p_supplier_id;
  v_supplier_balance := coalesce(v_supplier_balance, 0) + v_grand;

  update public.suppliers
    set outstanding_balance = v_supplier_balance
    where id = p_supplier_id;

  -- Purchase credit (we owe supplier)
  insert into public.supplier_ledger_entries (
    organization_id, branch_id, supplier_id, purchase_id, entry_type, direction,
    amount, balance_after, description, reference_number, created_by
  ) values (
    v_org_id, v_branch_id, p_supplier_id, v_purchase_id, 'purchase_credit', 'credit',
    v_grand, v_supplier_balance, 'Purchase ' || v_purchase_no, v_purchase_no, v_profile_id
  );

  -- Optional initial payment
  if coalesce(p_amount_paid, 0) > 0 then
    v_payment_id := gen_random_uuid();
    insert into public.supplier_payments (
      id, organization_id, branch_id, supplier_id, purchase_id,
      method, amount, reference_no, note, created_by
    ) values (
      v_payment_id, v_org_id, v_branch_id, p_supplier_id, v_purchase_id,
      coalesce(p_payment_method, 'cash'::public.payment_method),
      coalesce(p_amount_paid, 0), nullif(p_payment_ref, ''),
      'Payment with purchase ' || v_purchase_no, v_profile_id
    );

    v_supplier_balance := v_supplier_balance - coalesce(p_amount_paid, 0);
    update public.suppliers
      set outstanding_balance = v_supplier_balance
      where id = p_supplier_id;

    insert into public.supplier_ledger_entries (
      organization_id, branch_id, supplier_id, purchase_id, payment_id,
      entry_type, direction, amount, balance_after, description, reference_number, created_by
    ) values (
      v_org_id, v_branch_id, p_supplier_id, v_purchase_id, v_payment_id,
      'payment_debit', 'debit', coalesce(p_amount_paid, 0), v_supplier_balance,
      'Payment with purchase ' || v_purchase_no, nullif(p_payment_ref, ''), v_profile_id
    );
  end if;

  return query select v_purchase_id, v_purchase_no;
end;
$$;

------------------------------------------------------------------------------
-- 10. RPC: record_supplier_payment
--   Records a standalone payment to a supplier (optionally applied to a
--   specific purchase). Updates supplier_ledger + suppliers.outstanding_balance
--   + purchase amount_paid/balance_due/status when applicable.
------------------------------------------------------------------------------
create or replace function public.record_supplier_payment(
  p_supplier_id uuid,
  p_purchase_id uuid,
  p_branch_id uuid,
  p_method public.payment_method,
  p_amount numeric,
  p_reference_no text,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_profile_id uuid;
  v_branch_id uuid;
  v_payment_id uuid := gen_random_uuid();
  v_supplier_balance numeric;
  v_purchase record;
  v_new_paid numeric;
  v_new_balance numeric;
  v_new_status text;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '28000'; end if;

  select id, organization_id, branch_id
    into v_profile_id, v_org_id, v_branch_id
    from public.profiles
    where id = v_user_id and is_active = true;
  if v_org_id is null then raise exception 'No active profile' using errcode = 'P0001'; end if;

  if p_branch_id is not null then v_branch_id := p_branch_id; end if;
  if v_branch_id is null then raise exception 'No branch assigned for this user' using errcode = 'P0001'; end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Payment amount must be positive' using errcode = 'P0001';
  end if;

  -- Lock supplier
  select outstanding_balance into v_supplier_balance
    from public.suppliers
    where id = p_supplier_id and organization_id = v_org_id
    for update;
  if v_supplier_balance is null then
    raise exception 'Supplier not found' using errcode = 'P0001';
  end if;

  if p_amount > v_supplier_balance + 0.0001 then
    raise exception 'Payment exceeds outstanding balance (Rs %)', v_supplier_balance
      using errcode = 'P0001';
  end if;

  -- Optional purchase application
  if p_purchase_id is not null then
    select id, organization_id, amount_paid, grand_total, balance_due
      into v_purchase
      from public.supplier_purchases
      where id = p_purchase_id and organization_id = v_org_id
      for update;
    if not found then raise exception 'Purchase not found' using errcode = 'P0001'; end if;

    if p_amount > v_purchase.balance_due + 0.0001 then
      raise exception 'Payment exceeds purchase balance due (Rs %)', v_purchase.balance_due
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.supplier_payments (
    id, organization_id, branch_id, supplier_id, purchase_id,
    method, amount, reference_no, note, created_by
  ) values (
    v_payment_id, v_org_id, v_branch_id, p_supplier_id, p_purchase_id,
    p_method, p_amount, nullif(p_reference_no, ''), nullif(p_note, ''), v_profile_id
  );

  v_supplier_balance := v_supplier_balance - p_amount;
  update public.suppliers
    set outstanding_balance = v_supplier_balance
    where id = p_supplier_id;

  insert into public.supplier_ledger_entries (
    organization_id, branch_id, supplier_id, purchase_id, payment_id,
    entry_type, direction, amount, balance_after, description, reference_number, created_by
  ) values (
    v_org_id, v_branch_id, p_supplier_id, p_purchase_id, v_payment_id,
    'payment_debit', 'debit', p_amount, v_supplier_balance,
    'Supplier payment', nullif(p_reference_no, ''), v_profile_id
  );

  if p_purchase_id is not null then
    v_new_paid := v_purchase.amount_paid + p_amount;
    v_new_balance := greatest(v_purchase.grand_total - v_new_paid, 0);
    v_new_status := case
      when v_new_balance = 0 then 'paid'
      when v_new_paid > 0 then 'partial'
      else 'unpaid'
    end;
    update public.supplier_purchases
      set amount_paid = v_new_paid,
          balance_due = v_new_balance,
          status = v_new_status
      where id = p_purchase_id;
  end if;

  return v_payment_id;
end;
$$;

------------------------------------------------------------------------------
-- 11. Grants
------------------------------------------------------------------------------
grant execute on function public.create_supplier_purchase(
  uuid, uuid, date, jsonb, numeric, text, text, public.payment_method, numeric, text
) to authenticated, service_role;

grant execute on function public.record_supplier_payment(
  uuid, uuid, uuid, public.payment_method, numeric, text, text
) to authenticated, service_role;

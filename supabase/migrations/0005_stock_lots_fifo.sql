-- Migration 0005: Stock Lots & FIFO Inventory Tracking

-- 1. Create product_stock_lots table
create table public.product_stock_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  lot_number text,
  purchase_date date not null default current_date,
  quantity_received integer not null check (quantity_received >= 0),
  quantity_remaining integer not null check (quantity_remaining >= 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Create stock_movements table
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  stock_lot_id uuid references public.product_stock_lots(id) on delete cascade,
  movement_type text not null check (movement_type in ('purchase', 'sale', 'return_in', 'return_out', 'adjustment_in', 'adjustment_out', 'opening_stock', 'void')),
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12,2) check (unit_cost >= 0),
  reference_type text,
  reference_id uuid,
  invoice_id uuid references public.invoices(id) on delete set null,
  invoice_item_id uuid references public.invoice_items(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 3. Create invoice_item_stock_allocations table
create table public.invoice_item_stock_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  invoice_item_id uuid not null references public.invoice_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  stock_lot_id uuid not null references public.product_stock_lots(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.product_stock_lots enable row level security;
alter table public.stock_movements enable row level security;
alter table public.invoice_item_stock_allocations enable row level security;

-- Setup Scoped RLS Policies
create policy "Org scoped stock lots access"
on public.product_stock_lots for all
to authenticated
using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

create policy "Org scoped stock movements access"
on public.stock_movements for all
to authenticated
using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

create policy "Org scoped allocations access"
on public.invoice_item_stock_allocations for all
to authenticated
using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

-- Indexes for performance
create index idx_stock_lots_org on public.product_stock_lots(organization_id);
create index idx_stock_lots_product_fifo on public.product_stock_lots(product_id, quantity_remaining, purchase_date, created_at) where is_active = true and quantity_remaining > 0;
create index idx_stock_movements_org on public.stock_movements(organization_id);
create index idx_stock_movements_product on public.stock_movements(product_id, created_at desc);
create index idx_allocations_org on public.invoice_item_stock_allocations(organization_id);
create index idx_allocations_item on public.invoice_item_stock_allocations(invoice_item_id);

-- Setup update trigger
create trigger set_product_stock_lots_updated_at before update on public.product_stock_lots for each row execute function public.set_updated_at();

-- 4. Rewrite pos_checkout to implement atomic FIFO lot allocation
create or replace function public.pos_checkout(
  p_branch_id uuid,
  p_customer_id uuid,
  p_cart jsonb,            -- [{product_id, quantity, unit_price, discount}]
  p_discount_total numeric,
  p_payment_method public.payment_method,
  p_amount_paid numeric,
  p_payment_ref text,
  p_note text
)
returns table(invoice_id uuid, invoice_no text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_profile_id uuid;
  v_branch_id uuid := p_branch_id;
  v_invoice_id uuid := gen_random_uuid();
  v_invoice_no text;
  v_seq int;
  v_subtotal numeric := 0;
  v_grand numeric;
  v_balance numeric;
  v_item jsonb;
  v_product record;
  v_qty int;
  v_unit_price numeric;
  v_line_discount numeric;
  v_line_total numeric;
  v_status public.invoice_status;
  v_curr_balance numeric;
  v_balance_after numeric;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '28000'; end if;

  select id, organization_id, branch_id
    into v_profile_id, v_org_id, v_branch_id
    from public.profiles
    where id = v_user_id and is_active = true;
  if v_org_id is null then raise exception 'No active profile' using errcode = 'P0001'; end if;

  if p_branch_id is not null then v_branch_id := p_branch_id; end if;
  if v_branch_id is null then raise exception 'No branch assigned for this user' using errcode = 'P0001'; end if;

  if p_cart is null or jsonb_typeof(p_cart) <> 'array' or jsonb_array_length(p_cart) = 0 then
    raise exception 'Cart is empty' using errcode = 'P0001';
  end if;

  -- Serialize invoice number generation per organization
  perform 1 from public.organizations where id = v_org_id for update;

  select coalesce(
    max(nullif(regexp_replace(invoice_no, '\D', '', 'g'), '')::int),
    0
  ) + 1
    into v_seq
    from public.invoices
    where organization_id = v_org_id;
  v_invoice_no := 'INV-' || lpad(v_seq::text, 6, '0');

  -- Validate cart, lock products, accumulate subtotal
  for v_item in select * from jsonb_array_elements(p_cart) loop
    select id, name, type, sale_price, purchase_price, stock_quantity, is_active
      into v_product
      from public.products
      where id = (v_item->>'product_id')::uuid and organization_id = v_org_id
      for update;
    if not found then raise exception 'Product not in catalog' using errcode = 'P0001'; end if;
    if not v_product.is_active then
      raise exception 'Product not available: %', v_product.name using errcode = 'P0001';
    end if;

    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 then raise exception 'Invalid quantity for %', v_product.name using errcode = 'P0001'; end if;

    if v_product.type = 'product' and v_product.stock_quantity < v_qty then
      raise exception 'Insufficient stock for % (have %, need %)',
        v_product.name, v_product.stock_quantity, v_qty using errcode = 'P0001';
    end if;

    v_unit_price := coalesce(nullif(v_item->>'unit_price','')::numeric, v_product.sale_price);
    if v_unit_price < 0 then raise exception 'Negative unit price' using errcode = 'P0001'; end if;
    v_line_discount := coalesce(nullif(v_item->>'discount','')::numeric, 0);
    if v_line_discount < 0 then raise exception 'Negative line discount' using errcode = 'P0001'; end if;
    v_line_total := greatest((v_unit_price * v_qty) - v_line_discount, 0);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  v_grand := greatest(v_subtotal - coalesce(p_discount_total, 0), 0);
  v_balance := greatest(v_grand - coalesce(p_amount_paid, 0), 0);

  -- POS validation: Walk-in checks (cannot have debt)
  if p_customer_id is null and v_balance > 0 then
    raise exception 'Walk-in customer checkout must be fully paid' using errcode = 'P0001';
  end if;

  v_status := case
    when v_grand = 0 then 'paid'::public.invoice_status
    when coalesce(p_amount_paid, 0) >= v_grand then 'paid'::public.invoice_status
    when coalesce(p_amount_paid, 0) > 0 then 'partial'::public.invoice_status
    else 'unpaid'::public.invoice_status
  end;

  insert into public.invoices (
    id, organization_id, branch_id, customer_id, invoice_no, status,
    subtotal, discount_total, grand_total, amount_paid, balance_due,
    note, created_by
  ) values (
    v_invoice_id, v_org_id, v_branch_id, p_customer_id, v_invoice_no, v_status,
    v_subtotal, coalesce(p_discount_total, 0), v_grand,
    coalesce(p_amount_paid, 0), v_balance,
    nullif(p_note, ''), v_profile_id
  );

  -- Process cart and perform FIFO lot allocations
  for v_item in select * from jsonb_array_elements(p_cart) loop
    select id, name, type, sale_price, purchase_price
      into v_product from public.products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := coalesce(nullif(v_item->>'unit_price','')::numeric, v_product.sale_price);
    v_line_discount := coalesce(nullif(v_item->>'discount','')::numeric, 0);
    v_line_total := greatest((v_unit_price * v_qty) - v_line_discount, 0);

    if v_product.type = 'product' then
      declare
        v_qty_needed integer := v_qty;
        v_lot record;
        v_allocated integer;
        v_item_id uuid := gen_random_uuid();
        v_total_cost numeric := 0;
        v_unit_cost numeric;
      begin
        -- Lock product lots in FIFO order
        for v_lot in 
          select id, quantity_remaining, unit_cost 
          from public.product_stock_lots
          where product_id = v_product.id and is_active = true and quantity_remaining > 0 and organization_id = v_org_id
          order by purchase_date asc, created_at asc
          for update
        loop
          if v_qty_needed <= 0 then
            exit;
          end if;

          v_allocated := least(v_lot.quantity_remaining, v_qty_needed);
          
          -- Decrement lot quantity
          update public.product_stock_lots
          set quantity_remaining = quantity_remaining - v_allocated
          where id = v_lot.id;

          -- Add invoice item allocation
          insert into public.invoice_item_stock_allocations (
            organization_id, invoice_id, invoice_item_id, product_id, stock_lot_id, quantity, unit_cost
          ) values (
            v_org_id, v_invoice_id, v_item_id, v_product.id, v_lot.id, v_allocated, v_lot.unit_cost
          );

          -- Add stock movement
          insert into public.stock_movements (
            organization_id, branch_id, product_id, stock_lot_id, movement_type,
            quantity, unit_cost, reference_type, reference_id, invoice_id, invoice_item_id, notes, created_by
          ) values (
            v_org_id, v_branch_id, v_product.id, v_lot.id, 'sale',
            v_allocated, v_lot.unit_cost, 'invoice', v_invoice_id, v_invoice_id, v_item_id, 'POS checkout sale', v_profile_id
          );

          v_total_cost := v_total_cost + (v_allocated * v_lot.unit_cost);
          v_qty_needed := v_qty_needed - v_allocated;
        end loop;

        if v_qty_needed > 0 then
          raise exception 'Insufficient stock lot batches available for product % (needed %, short by %)',
            v_product.name, v_qty, v_qty_needed using errcode = 'P0001';
        end if;

        -- Calculate weighted average purchase price
        v_unit_cost := v_total_cost / v_qty;

        -- Insert into invoice items
        insert into public.invoice_items (
          id, organization_id, invoice_id, product_id, product_name, product_type,
          quantity, purchase_price, unit_price, item_discount, line_total
        ) values (
          v_item_id, v_org_id, v_invoice_id, v_product.id, v_product.name, v_product.type,
          v_qty, v_unit_cost, v_unit_price, v_line_discount, v_line_total
        );

        -- Update product global stock quantity
        update public.products
        set stock_quantity = stock_quantity - v_qty
        where id = v_product.id;
      end;
    else
      -- For services, insert directly into invoice items without stock lots or allocations
      declare
        v_item_id uuid := gen_random_uuid();
      begin
        insert into public.invoice_items (
          id, organization_id, invoice_id, product_id, product_name, product_type,
          quantity, purchase_price, unit_price, item_discount, line_total
        ) values (
          v_item_id, v_org_id, v_invoice_id, v_product.id, v_product.name, v_product.type,
          v_qty, 0, v_unit_price, v_line_discount, v_line_total
        );
      end;
    end if;
  end loop;

  if coalesce(p_amount_paid, 0) > 0 then
    insert into public.payments (
      organization_id, branch_id, invoice_id, customer_id,
      method, amount, reference_no, received_by
    ) values (
      v_org_id, v_branch_id, v_invoice_id, p_customer_id,
      p_payment_method, p_amount_paid, nullif(p_payment_ref, ''), v_profile_id
    );
  end if;

  -- Customer outstanding balance and ledger creation
  if p_customer_id is not null and v_balance > 0 then
    select outstanding_balance into v_curr_balance from public.customers where id = p_customer_id for update;
    v_balance_after := coalesce(v_curr_balance, 0) + v_balance;

    update public.customers
      set outstanding_balance = v_balance_after
      where id = p_customer_id;

    insert into public.customer_ledger_entries (
      organization_id, branch_id, customer_id, invoice_id, entry_type, direction,
      amount, balance_after, description, created_by
    ) values (
      v_org_id, v_branch_id, p_customer_id, v_invoice_id, 'invoice_credit', 'debit',
      v_balance, v_balance_after, 'Invoice ' || v_invoice_no || ' balance due', v_profile_id
    );
  end if;

  return query select v_invoice_id, v_invoice_no;
end;
$$;


-- 5. Helper RPC for Restock / Add Stock Lot
create or replace function public.add_stock_lot(
  p_product_id uuid,
  p_lot_number text,
  p_purchase_date date,
  p_qty_received integer,
  p_unit_cost numeric,
  p_supplier_id uuid,
  p_notes text
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
  v_lot_id uuid := gen_random_uuid();
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  
  select id, organization_id, branch_id
    into v_profile_id, v_org_id, v_branch_id
    from public.profiles
    where id = v_user_id and is_active = true;
  if v_org_id is null then raise exception 'No active profile' using errcode = 'P0001'; end if;
  
  -- Verify product
  perform 1 from public.products 
    where id = p_product_id and organization_id = v_org_id and type = 'product';
  if not found then raise exception 'Physical product not found' using errcode = 'P0001'; end if;

  -- Insert lot
  insert into public.product_stock_lots (
    id, organization_id, branch_id, product_id, supplier_id, lot_number,
    purchase_date, quantity_received, quantity_remaining, unit_cost, notes, created_by
  ) values (
    v_lot_id, v_org_id, v_branch_id, p_product_id, p_supplier_id, p_lot_number,
    p_purchase_date, p_qty_received, p_qty_received, p_unit_cost, p_notes, v_profile_id
  );

  -- Insert movement
  insert into public.stock_movements (
    organization_id, branch_id, product_id, stock_lot_id, movement_type,
    quantity, unit_cost, reference_type, reference_id, notes, created_by
  ) values (
    v_org_id, v_branch_id, p_product_id, v_lot_id, 'purchase',
    p_qty_received, p_unit_cost, 'restock', v_lot_id, p_notes, v_profile_id
  );

  -- Update product quantity
  update public.products
  set stock_quantity = stock_quantity + p_qty_received
  where id = p_product_id;
end;
$$;

-- 6. Helper RPC for Manual Stock Adjustment
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_adjustment_type text, -- 'in' or 'out'
  p_qty integer,
  p_notes text
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
  v_avg_cost numeric := 0;
  v_lot_id uuid;
  v_qty_needed integer := p_qty;
  v_lot record;
  v_allocated integer;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  
  select id, organization_id, branch_id
    into v_profile_id, v_org_id, v_branch_id
    from public.profiles
    where id = v_user_id and is_active = true;
  if v_org_id is null then raise exception 'No active profile' using errcode = 'P0001'; end if;

  -- Verify product
  perform 1 from public.products 
    where id = p_product_id and organization_id = v_org_id and type = 'product';
  if not found then raise exception 'Physical product not found' using errcode = 'P0001'; end if;

  if p_adjustment_type = 'in' then
    -- Get weighted average cost of remaining stock, or fallback to standard purchase price
    select coalesce(
      sum(quantity_remaining * unit_cost) / nullif(sum(quantity_remaining), 0),
      (select purchase_price from public.products where id = p_product_id)
    ) into v_avg_cost
    from public.product_stock_lots
    where product_id = p_product_id and is_active = true and quantity_remaining > 0;
    
    v_avg_cost := coalesce(v_avg_cost, 0);
    v_lot_id := gen_random_uuid();

    -- Create adjustment lot
    insert into public.product_stock_lots (
      id, organization_id, branch_id, product_id, lot_number,
      purchase_date, quantity_received, quantity_remaining, unit_cost, notes, created_by
    ) values (
      v_lot_id, v_org_id, v_branch_id, p_product_id, 'ADJUST-' || to_char(current_date, 'YYYYMMDD'),
      current_date, p_qty, p_qty, v_avg_cost, p_notes, v_profile_id
    );

    -- Create movement
    insert into public.stock_movements (
      organization_id, branch_id, product_id, stock_lot_id, movement_type,
      quantity, unit_cost, reference_type, notes, created_by
    ) values (
      v_org_id, v_branch_id, p_product_id, v_lot_id, 'adjustment_in',
      p_qty, v_avg_cost, 'adjustment', p_notes, v_profile_id
    );

    -- Update product stock
    update public.products
    set stock_quantity = stock_quantity + p_qty
    where id = p_product_id;

  elsif p_adjustment_type = 'out' then
    -- FIFO deduction from active lots
    for v_lot in 
      select id, quantity_remaining, unit_cost 
      from public.product_stock_lots
      where product_id = p_product_id and is_active = true and quantity_remaining > 0 and organization_id = v_org_id
      order by purchase_date asc, created_at asc
      for update
    loop
      if v_qty_needed <= 0 then
        exit;
      end if;

      v_allocated := least(v_lot.quantity_remaining, v_qty_needed);

      -- Decrement lot quantity
      update public.product_stock_lots
      set quantity_remaining = quantity_remaining - v_allocated
      where id = v_lot.id;

      -- Create movement
      insert into public.stock_movements (
        organization_id, branch_id, product_id, stock_lot_id, movement_type,
        quantity, unit_cost, reference_type, notes, created_by
      ) values (
        v_org_id, v_branch_id, p_product_id, v_lot.id, 'adjustment_out',
        v_allocated, v_lot.unit_cost, 'adjustment', p_notes, v_profile_id
      );

      v_qty_needed := v_qty_needed - v_allocated;
    end loop;

    if v_qty_needed > 0 then
      raise exception 'Insufficient stock batches remaining to perform adjustment out' using errcode = 'P0001';
    end if;

    -- Update product stock
    update public.products
    set stock_quantity = stock_quantity - p_qty
    where id = p_product_id;

  else
    raise exception 'Invalid adjustment type' using errcode = 'P0001';
  end if;
end;
$$;

-- Grant permissions
grant execute on function public.add_stock_lot(uuid, text, date, integer, numeric, uuid, text) to authenticated;
grant execute on function public.adjust_stock(uuid, text, integer, text) to authenticated;


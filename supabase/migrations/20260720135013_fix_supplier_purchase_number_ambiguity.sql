-- Qualify the supplier-purchase number query so PostgreSQL does not confuse the
-- RETURNS TABLE output parameter with supplier_purchases.purchase_no. The
-- replacement also enforces the same owner/admin/manager and active scoped
-- branch/supplier contract already used by the application entry point.

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
  v_profile public.profiles%rowtype;
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
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select *
    into v_profile
    from public.profiles
    where id = v_user_id
      and is_active = true;
  if not found or v_profile.organization_id is null then
    raise exception 'No active profile' using errcode = 'P0001';
  end if;
  if v_profile.role not in ('owner', 'admin', 'manager') then
    raise exception 'You do not have permission to record supplier purchases.'
      using errcode = '42501';
  end if;

  v_profile_id := v_profile.id;
  v_org_id := v_profile.organization_id;
  v_branch_id := coalesce(p_branch_id, v_profile.branch_id);
  if v_branch_id is null or not exists (
    select 1
    from public.branches b
    where b.id = v_branch_id
      and b.organization_id = v_org_id
      and b.is_active = true
  ) then
    raise exception 'No active branch is assigned to this purchase.'
      using errcode = '42501';
  end if;

  perform 1
  from public.suppliers s
  where s.id = p_supplier_id
    and s.organization_id = v_org_id
    and s.is_active = true
  for update;
  if not found then
    raise exception 'Supplier not found or inactive' using errcode = 'P0001';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Purchase must include at least one item' using errcode = 'P0001';
  end if;

  -- Retain the per-organization lock that serializes purchase numbering.
  perform 1
  from public.organizations o
  where o.id = v_org_id
  for update;

  select coalesce(
    max(
      nullif(
        regexp_replace(sp.purchase_no, '\D', '', 'g'),
        ''
      )::int
    ),
    0
  ) + 1
    into v_seq
    from public.supplier_purchases sp
    where sp.organization_id = v_org_id;
  v_purchase_no := 'PUR-' || lpad(v_seq::text, 6, '0');

  -- First pass: validate every item before creating any purchase artifacts.
  for v_item in select * from jsonb_array_elements(p_items) loop
    select p.id, p.name, p.type, p.is_active
      into v_product
      from public.products p
      where p.id = (v_item->>'product_id')::uuid
        and p.organization_id = v_org_id
      for update;
    if not found then
      raise exception 'Product not in catalog' using errcode = 'P0001';
    end if;
    if not v_product.is_active then
      raise exception 'Product not available: %', v_product.name using errcode = 'P0001';
    end if;
    if v_product.type <> 'product' then
      raise exception 'Cannot purchase stock for non-product item: %', v_product.name
        using errcode = 'P0001';
    end if;

    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 then
      raise exception 'Invalid quantity for %', v_product.name using errcode = 'P0001';
    end if;

    v_unit_cost := coalesce(nullif(v_item->>'unit_cost', '')::numeric, 0);
    if v_unit_cost < 0 then
      raise exception 'Negative unit cost for %', v_product.name using errcode = 'P0001';
    end if;

    v_line_total := v_unit_cost * v_qty;
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  if coalesce(p_discount_total, 0) < 0 then
    raise exception 'Discount cannot be negative' using errcode = 'P0001';
  end if;
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

  -- Second pass: create one lot, movement, and item row per product.
  for v_item in select * from jsonb_array_elements(p_items) loop
    select p.id, p.name
      into v_product
      from public.products p
      where p.id = (v_item->>'product_id')::uuid
        and p.organization_id = v_org_id;
    v_qty := (v_item->>'quantity')::int;
    v_unit_cost := coalesce(nullif(v_item->>'unit_cost', '')::numeric, 0);
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

    update public.products p
      set stock_quantity = p.stock_quantity + v_qty
      where p.id = v_product.id
        and p.organization_id = v_org_id;
  end loop;

  select s.outstanding_balance
    into v_supplier_balance
    from public.suppliers s
    where s.id = p_supplier_id
      and s.organization_id = v_org_id;
  v_supplier_balance := coalesce(v_supplier_balance, 0) + v_grand;

  update public.suppliers s
    set outstanding_balance = v_supplier_balance
    where s.id = p_supplier_id
      and s.organization_id = v_org_id;

  insert into public.supplier_ledger_entries (
    organization_id, branch_id, supplier_id, purchase_id, entry_type, direction,
    amount, balance_after, description, reference_number, created_by
  ) values (
    v_org_id, v_branch_id, p_supplier_id, v_purchase_id, 'purchase_credit', 'credit',
    v_grand, v_supplier_balance, 'Purchase ' || v_purchase_no, v_purchase_no, v_profile_id
  );

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
    update public.suppliers s
      set outstanding_balance = v_supplier_balance
      where s.id = p_supplier_id
        and s.organization_id = v_org_id;

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

revoke all on function public.create_supplier_purchase(
  uuid, uuid, date, jsonb, numeric, text, text, public.payment_method, numeric, text
) from public;
revoke all on function public.create_supplier_purchase(
  uuid, uuid, date, jsonb, numeric, text, text, public.payment_method, numeric, text
) from anon;
revoke all on function public.create_supplier_purchase(
  uuid, uuid, date, jsonb, numeric, text, text, public.payment_method, numeric, text
) from service_role;
grant execute on function public.create_supplier_purchase(
  uuid, uuid, date, jsonb, numeric, text, text, public.payment_method, numeric, text
) to authenticated;

comment on function public.create_supplier_purchase(
  uuid, uuid, date, jsonb, numeric, text, text, public.payment_method, numeric, text
) is 'Atomically records a scoped supplier purchase, FIFO lots, stock movements, supplier ledger entries, and optional initial payment.';

-- Reject sub-paisa authoritative debt movements; never round caller input.
-- CREATE OR REPLACE retains existing signatures, owners and EXECUTE grants.

begin;

create or replace function public.record_credit_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_method public.credit_payment_method,
  p_reference_number text,
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
  v_curr_balance numeric;
  v_balance_after numeric;
  v_payment_id uuid := gen_random_uuid();
  v_remaining numeric;
  v_inv record;
  v_alloc numeric;
  v_new_amount_paid numeric;
  v_new_balance_due numeric;
  v_new_status public.invoice_status;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '28000'; end if;

  select id, organization_id, branch_id
    into v_profile_id, v_org_id, v_branch_id
    from public.profiles
    where id = v_user_id and is_active = true;
  if v_org_id is null then raise exception 'No active profile' using errcode = 'P0001'; end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Payment amount must be positive' using errcode = 'P0001';
  end if;

  if p_amount::text in ('NaN', 'Infinity', '-Infinity') or p_amount <> round(p_amount, 2) then
    raise exception 'Amount must have no more than 2 decimal places.' using errcode = 'P0001';
  end if;

  -- Lock customer row and check balance
  select outstanding_balance into v_curr_balance from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Customer not found' using errcode = 'P0001'; end if;

  if coalesce(v_curr_balance, 0) < p_amount then
    raise exception 'Payment amount exceeds outstanding balance' using errcode = 'P0001';
  end if;

  v_balance_after := coalesce(v_curr_balance, 0) - p_amount;

  -- Update customer outstanding balance
  update public.customers
    set outstanding_balance = v_balance_after
    where id = p_customer_id;

  -- Insert into credit_payments
  insert into public.credit_payments (
    id, organization_id, branch_id, customer_id, amount, method, reference_number, notes, received_by
  ) values (
    v_payment_id, v_org_id, v_branch_id, p_customer_id, p_amount, p_method, p_reference_number, p_notes, v_profile_id
  );

  -- FIFO allocation: allocate payment to oldest unpaid/partial invoices first
  v_remaining := p_amount;
  for v_inv in
    select id, balance_due, amount_paid, status
    from public.invoices
    where customer_id = p_customer_id
      and organization_id = v_org_id
      and status in ('unpaid', 'partial')
      and balance_due > 0
    order by invoice_date asc, created_at asc
    for update
  loop
    exit when v_remaining <= 0;

    v_alloc := least(v_remaining, v_inv.balance_due);
    v_new_amount_paid := v_inv.amount_paid + v_alloc;
    v_new_balance_due := v_inv.balance_due - v_alloc;

    if v_new_balance_due = 0 then
      v_new_status := 'paid'::public.invoice_status;
    else
      v_new_status := 'partial'::public.invoice_status;
    end if;

    update public.invoices
      set amount_paid = v_new_amount_paid,
          balance_due = v_new_balance_due,
          status = v_new_status
      where id = v_inv.id;

    v_remaining := v_remaining - v_alloc;
  end loop;

  -- Insert into customer_ledger_entries
  insert into public.customer_ledger_entries (
    organization_id, branch_id, customer_id, credit_payment_id, entry_type, direction,
    amount, balance_after, description, reference_number, created_by
  ) values (
    v_org_id, v_branch_id, p_customer_id, v_payment_id, 'credit_payment', 'credit',
    p_amount, v_balance_after, coalesce(nullif(p_notes, ''), 'Credit payment settlement'), p_reference_number, v_profile_id
  );
end;
$$;

create or replace function public.record_customer_write_off(
  p_customer_id uuid,
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

  -- Only owner and admin can write off
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and role in ('owner', 'admin')
  ) then
    raise exception 'Only owner or admin can write off customer credit' using errcode = 'P0001';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Write-off amount must be positive' using errcode = 'P0001';
  end if;

  if p_amount::text in ('NaN', 'Infinity', '-Infinity') or p_amount <> round(p_amount, 2) then
    raise exception 'Amount must have no more than 2 decimal places.' using errcode = 'P0001';
  end if;

  -- Lock customer row
  select outstanding_balance into v_curr_balance from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Customer not found' using errcode = 'P0001'; end if;

  if p_amount > coalesce(v_curr_balance, 0) then
    raise exception 'Write-off amount exceeds outstanding balance' using errcode = 'P0001';
  end if;

  v_balance_after := coalesce(v_curr_balance, 0) - p_amount;

  -- Update customer outstanding balance
  update public.customers
    set outstanding_balance = v_balance_after
    where id = p_customer_id;

  -- Insert into customer_write_offs
  insert into public.customer_write_offs (
    id, organization_id, branch_id, customer_id, amount, reason, written_by
  ) values (
    v_write_off_id, v_org_id, v_branch_id, p_customer_id, p_amount, p_reason, v_profile_id
  );

  -- Insert into customer_ledger_entries
  insert into public.customer_ledger_entries (
    organization_id, branch_id, customer_id, entry_type, direction,
    amount, balance_after, description, created_by
  ) values (
    v_org_id, v_branch_id, p_customer_id, 'write_off', 'credit',
    p_amount, v_balance_after, 'Credit write-off: ' || p_reason, v_profile_id
  );
end;
$$;

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
  v_remaining numeric;
  v_inv record;
  v_alloc numeric;
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

  if p_amount::text in ('NaN', 'Infinity', '-Infinity') or p_amount <> round(p_amount, 2) then
    raise exception 'Amount must have no more than 2 decimal places.' using errcode = 'P0001';
  end if;

  -- Lock supplier and check balance
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

  -- ── Purchase-specific path (unchanged from today) ──
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

  -- Insert payment record
  insert into public.supplier_payments (
    id, organization_id, branch_id, supplier_id, purchase_id,
    method, amount, reference_no, note, created_by
  ) values (
    v_payment_id, v_org_id, v_branch_id, p_supplier_id, p_purchase_id,
    p_method, p_amount, nullif(p_reference_no, ''), nullif(p_note, ''), v_profile_id
  );

  -- Reduce supplier outstanding balance (IDENTICAL to before)
  v_supplier_balance := v_supplier_balance - p_amount;
  update public.suppliers
    set outstanding_balance = v_supplier_balance
    where id = p_supplier_id;

  -- ── FIFO allocation: on-account → oldest unpaid/partial purchases first ──
  if p_purchase_id is null then
    v_remaining := p_amount;
    for v_inv in
      select id, balance_due, amount_paid
      from public.supplier_purchases
      where supplier_id = p_supplier_id
        and organization_id = v_org_id
        and status in ('unpaid', 'partial')
        and balance_due > 0
      order by purchase_date asc, created_at asc
      for update
    loop
      exit when v_remaining <= 0;

      v_alloc := least(v_remaining, v_inv.balance_due);
      v_new_paid := v_inv.amount_paid + v_alloc;
      v_new_balance := v_inv.balance_due - v_alloc;

      if v_new_balance = 0 then
        v_new_status := 'paid';
      else
        v_new_status := 'partial';
      end if;

      update public.supplier_purchases
        set amount_paid = v_new_paid,
            balance_due = v_new_balance,
            status = v_new_status
        where id = v_inv.id;

      v_remaining := v_remaining - v_alloc;
    end loop;
  end if;

  -- ── Purchase-specific update (unchanged, skipped when p_purchase_id IS NULL) ──
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

  -- Insert single ledger entry for the total payment (same as before)
  insert into public.supplier_ledger_entries (
    organization_id, branch_id, supplier_id, purchase_id, payment_id,
    entry_type, direction, amount, balance_after, description, reference_number, created_by
  ) values (
    v_org_id, v_branch_id, p_supplier_id, p_purchase_id, v_payment_id,
    'payment_debit', 'debit', p_amount, v_supplier_balance,
    'Supplier payment', nullif(p_reference_no, ''), v_profile_id
  );

  return v_payment_id;
end;
$$;

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

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Write-off amount must be positive' using errcode = 'P0001';
  end if;

  if p_amount::text in ('NaN', 'Infinity', '-Infinity') or p_amount <> round(p_amount, 2) then
    raise exception 'Amount must have no more than 2 decimal places.' using errcode = 'P0001';
  end if;

  -- Lock supplier row
  select outstanding_balance into v_curr_balance
    from public.suppliers
    where id = p_supplier_id and organization_id = v_org_id
    for update;
  if not found then raise exception 'Supplier not found' using errcode = 'P0001'; end if;

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

create or replace function public.pos_checkout(
  p_branch_id uuid,
  p_customer_id uuid,
  p_cart jsonb,
  p_discount_total numeric,
  p_payment_method public.payment_method,
  p_amount_paid numeric,
  p_payment_ref text,
  p_note text,
  p_allow_loss_override boolean default false,
  p_idempotency_key text default null
)
returns table(invoice_id uuid, invoice_no text, idempotent_replay boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_profile_id uuid;
  v_branch_id uuid := p_branch_id;
  v_role public.user_role;
  v_can_sell boolean := false;
  v_can_discount boolean := false;
  v_can_sell_at_loss boolean := false;
  v_effective_loss_override boolean := false;
  v_invoice_id uuid := gen_random_uuid();
  v_invoice_no text;
  v_seq int;
  v_subtotal numeric := 0;
  v_grand numeric;
  v_amount_tendered numeric := 0;
  v_amount_settled numeric := 0;
  v_change_due numeric := 0;
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

  v_total_product_revenue numeric := 0;
  v_allocated_bill_discount numeric := 0;
  v_effective_line_revenue numeric := 0;

  v_svc_principal numeric;
  v_svc_commission numeric;
  v_svc_total_charged numeric;
  v_svc_provider text;
  v_svc_direction text;
  v_svc_account text;
  v_svc_receiver text;
  v_svc_reference text;
  v_svc_note text;

  -- Idempotency
  v_idem_key text := nullif(trim(p_idempotency_key), '');
  v_existing_id uuid;
  v_existing_no text;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '28000'; end if;

  select p.id, p.organization_id, p.branch_id, p.role,
         case when p.role in ('owner', 'admin') then true
              else coalesce(sp.can_sell, p.role in ('manager', 'cashier')) end,
         case when p.role in ('owner', 'admin') then true
              else coalesce(sp.can_discount, p.role in ('manager', 'cashier')) end,
         case when p.role in ('owner', 'admin') then true
              else coalesce(sp.can_sell_at_loss, false) end
    into v_profile_id, v_org_id, v_branch_id, v_role,
         v_can_sell, v_can_discount, v_can_sell_at_loss
    from public.profiles p
    left join public.staff_permissions sp
      on sp.profile_id = p.id and sp.organization_id = p.organization_id
    where p.id = v_user_id and p.is_active = true;
  if v_org_id is null then raise exception 'No active profile' using errcode = 'P0001'; end if;

  -- Match the action's effective permissions, without trusting its caller.
  if v_role is null or v_role not in ('owner', 'admin', 'manager', 'cashier', 'technician')
     or v_can_sell is not true then
    raise exception 'You do not have permission to sell.' using errcode = '42501';
  end if;
  v_effective_loss_override := coalesce(p_allow_loss_override, false) and v_can_sell_at_loss;

  -- Checkout uses the profile's assigned branch; there is no POS branch picker.
  if p_branch_id is not null and p_branch_id is distinct from v_branch_id then
    raise exception 'Branch not available for this checkout' using errcode = '42501';
  end if;
  if v_branch_id is null then raise exception 'No branch assigned for this user' using errcode = 'P0001'; end if;

  if not exists (select 1 from public.branches b where b.id = v_branch_id and b.organization_id = v_org_id) then
    raise exception 'Branch not available for this checkout' using errcode = '42501';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.organization_id = v_org_id
  ) then
    raise exception 'Customer not available for this checkout' using errcode = '42501';
  end if;

  if p_cart is null or jsonb_typeof(p_cart) <> 'array' or jsonb_array_length(p_cart) = 0 then
    raise exception 'Cart is empty' using errcode = 'P0001';
  end if;

  if v_can_discount is not true and (
    coalesce(p_discount_total, 0) > 0
    or exists (
      select 1 from jsonb_array_elements(p_cart) item
      where coalesce(nullif(item->>'discount', '')::numeric, 0) > 0
    )
  ) then
    raise exception 'You do not have permission to apply discounts.' using errcode = '42501';
  end if;

  perform 1 from public.organizations where id = v_org_id for update;

  -- ── Idempotency guard ──────────────────────────────────────────────────────
  -- After acquiring the per-org checkout lock above, a concurrent first request
  -- with the same key has committed and its invoice is visible. Return it
  -- without applying any stock/payment mutations again.
  if v_idem_key is not null then
    select i.id, i.invoice_no into v_existing_id, v_existing_no
      from public.invoices i
     where i.organization_id = v_org_id
       and i.checkout_idempotency_key = v_idem_key;
    if found then
      return query select v_existing_id, v_existing_no, true;
      return;
    end if;
  end if;
  -- ───────────────────────────────────────────────────────────────────────────

  select coalesce(
    max(nullif(regexp_replace(invoices.invoice_no, '\D', '', 'g'), '')::int),
    0
  ) + 1
    into v_seq
    from public.invoices
    where organization_id = v_org_id;
  v_invoice_no := 'INV-' || lpad(v_seq::text, 6, '0');

  v_total_product_revenue := 0;
  for v_item in select * from jsonb_array_elements(p_cart) loop
    select id, type, sale_price
      into v_product
      from public.products
      where id = (v_item->>'product_id')::uuid and organization_id = v_org_id;
    if found and v_product.type = 'product' then
      v_qty := coalesce((v_item->>'quantity')::int, 0);
      v_unit_price := coalesce(nullif(v_item->>'unit_price','')::numeric, v_product.sale_price);
      v_line_discount := coalesce(nullif(v_item->>'discount','')::numeric, 0);
      v_line_total := greatest((v_unit_price * v_qty) - v_line_discount, 0);
      v_total_product_revenue := v_total_product_revenue + v_line_total;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(p_cart) loop
    select id, name, type, sale_price, purchase_price, stock_quantity, is_active,
           allow_sell_at_loss, sell_at_loss_reason,
           requires_provider, requires_account_number, requires_reference
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
      raise exception 'Not enough stock for % (available: %, needed: %)',
        v_product.name, v_product.stock_quantity, v_qty using errcode = 'P0001';
    end if;

    v_unit_price := coalesce(nullif(v_item->>'unit_price','')::numeric, v_product.sale_price);
    if v_unit_price < 0 then raise exception 'Negative unit price' using errcode = 'P0001'; end if;
    v_line_discount := coalesce(nullif(v_item->>'discount','')::numeric, 0);
    if v_line_discount < 0 then raise exception 'Negative line discount' using errcode = 'P0001'; end if;

    -- Match the action's physical-price tolerance; service pricing is separate.
    if v_can_discount is not true and v_product.type = 'product'
       and v_unit_price < v_product.sale_price - 0.001 then
      raise exception 'You do not have permission to sell below the listed price.' using errcode = '42501';
    end if;

    if v_product.type = 'service' then
      v_svc_principal     := coalesce(nullif(v_item->>'service_transaction_amount','')::numeric, 0);
      v_svc_commission    := coalesce(nullif(v_item->>'service_commission','')::numeric, 0);
      v_svc_total_charged := coalesce(nullif(v_item->>'service_total_charged','')::numeric, v_svc_principal + v_svc_commission);

      -- Effective sale price for services: the amount charged to the customer.
      -- Treat blank, null, or zero unit_price as missing; fall back to service_total_charged.
      v_unit_price := coalesce(nullif(v_item->>'unit_price','')::numeric, 0);
      if v_unit_price = 0 then
        v_unit_price := v_svc_total_charged;
      end if;
    end if;

    v_line_total := greatest((v_unit_price * v_qty) - v_line_discount, 0);
    v_subtotal := v_subtotal + v_line_total;

    if v_product.type = 'service' then
      v_svc_provider      := nullif(trim(coalesce(v_item->>'service_provider', '')), '');
      v_svc_direction     := nullif(trim(coalesce(v_item->>'service_direction', '')), '');
      v_svc_account       := nullif(trim(coalesce(v_item->>'service_account_number', '')), '');
      v_svc_receiver      := nullif(trim(coalesce(v_item->>'service_receiver_account', '')), '');
      v_svc_reference     := nullif(trim(coalesce(v_item->>'service_reference_no', '')), '');
      v_svc_note          := nullif(trim(coalesce(v_item->>'service_note', '')), '');

      if v_svc_principal < 0 then raise exception 'Service principal must be 0 or more' using errcode = 'P0001'; end if;
      if v_svc_commission < 0 then raise exception 'Service commission must be 0 or more' using errcode = 'P0001'; end if;
      if v_svc_total_charged < v_svc_commission then
        raise exception 'Service total charged (%) cannot be less than commission (%)',
          v_svc_total_charged, v_svc_commission using errcode = 'P0001';
      end if;

      if v_product.requires_provider and v_svc_provider is null then
        raise exception 'Service provider is required for %', v_product.name using errcode = 'P0001';
      end if;
      if v_product.requires_account_number and v_svc_account is null and v_svc_receiver is null then
        raise exception 'Sender or receiver account is required for %', v_product.name using errcode = 'P0001';
      end if;
      if v_product.requires_reference and v_svc_reference is null then
        raise exception 'Reference number is required for %', v_product.name using errcode = 'P0001';
      end if;
    end if;
  end loop;

  v_grand := greatest(v_subtotal - coalesce(p_discount_total, 0), 0);
  v_amount_tendered := greatest(coalesce(p_amount_paid, 0), 0);
  v_amount_settled := least(v_amount_tendered, v_grand);
  v_change_due := greatest(v_amount_tendered - v_grand, 0);
  v_balance := greatest(v_grand - v_amount_tendered, 0);

  -- Only the authoritative customer debt increment is constrained here.
  if p_customer_id is not null then
    if v_balance::text in ('NaN', 'Infinity', '-Infinity') or v_balance <> round(v_balance, 2) then
      raise exception 'Amount must have no more than 2 decimal places.' using errcode = 'P0001';
    end if;
  end if;

  if p_customer_id is null and v_balance > 0 then
    raise exception 'Walk-in customer checkout must be fully paid' using errcode = 'P0001';
  end if;

  v_status := case
    when v_grand = 0 then 'paid'::public.invoice_status
    when v_amount_tendered >= v_grand then 'paid'::public.invoice_status
    when v_amount_tendered > 0 then 'partial'::public.invoice_status
    else 'unpaid'::public.invoice_status
  end;

  -- Invoice insert: stores the idempotency key. The unique_violation handler is a
  -- belt-and-suspenders backstop behind the per-org lock; it returns the original
  -- invoice on a same-key race and re-raises anything that is NOT a key conflict
  -- (e.g. an invoice_no race), so real errors are never masked.
  begin
    insert into public.invoices (
      id, organization_id, branch_id, customer_id, invoice_no, status,
      subtotal, discount_total, grand_total, amount_paid, balance_due,
      amount_tendered, change_due, note, created_by, checkout_idempotency_key
    ) values (
      v_invoice_id, v_org_id, v_branch_id, p_customer_id, v_invoice_no, v_status,
      v_subtotal, coalesce(p_discount_total, 0), v_grand,
      v_amount_settled, v_balance,
      v_amount_tendered, v_change_due, nullif(p_note, ''), v_profile_id, v_idem_key
    );
  exception when unique_violation then
    if v_idem_key is not null then
      select i.id, i.invoice_no into v_existing_id, v_existing_no
        from public.invoices i
       where i.organization_id = v_org_id
         and i.checkout_idempotency_key = v_idem_key;
      if found then
        return query select v_existing_id, v_existing_no, true;
        return;
      end if;
    end if;
    raise;
  end;

  for v_item in select * from jsonb_array_elements(p_cart) loop
    select id, name, type, sale_price, purchase_price, allow_sell_at_loss, sell_at_loss_reason
      into v_product from public.products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := coalesce(nullif(v_item->>'unit_price','')::numeric, v_product.sale_price);
    v_line_discount := coalesce(nullif(v_item->>'discount','')::numeric, 0);
    v_line_total := greatest((v_unit_price * v_qty) - v_line_discount, 0);

    if v_product.type = 'service' then
      v_svc_principal     := coalesce(nullif(v_item->>'service_transaction_amount','')::numeric, 0);
      v_svc_commission    := coalesce(nullif(v_item->>'service_commission','')::numeric, 0);
      v_svc_total_charged := coalesce(nullif(v_item->>'service_total_charged','')::numeric, v_svc_principal + v_svc_commission);

      -- Effective sale price for services: the amount charged to the customer.
      -- Treat blank, null, or zero unit_price as missing; fall back to service_total_charged.
      v_unit_price := coalesce(nullif(v_item->>'unit_price','')::numeric, 0);
      if v_unit_price = 0 then
        v_unit_price := v_svc_total_charged;
      end if;
      v_line_total := greatest((v_unit_price * v_qty) - v_line_discount, 0);
    end if;

    if v_product.type = 'product' then
      declare
        v_qty_needed integer := v_qty;
        v_lot record;
        v_allocated integer;
        v_item_id uuid := gen_random_uuid();
        v_total_cost numeric := 0;
        v_unit_cost numeric;
      begin
        insert into public.invoice_items (
          id, organization_id, invoice_id, product_id, product_name, product_type,
          quantity, purchase_price, unit_price, item_discount, line_total
        ) values (
          v_item_id, v_org_id, v_invoice_id, v_product.id, v_product.name, v_product.type,
          v_qty, 0, v_unit_price, v_line_discount, v_line_total
        );

        for v_lot in
          select id, quantity_remaining, unit_cost
          from public.product_stock_lots
          where product_id = v_product.id and is_active = true and quantity_remaining > 0 and organization_id = v_org_id
          order by purchase_date asc, created_at asc
          for update
        loop
          if v_qty_needed <= 0 then exit; end if;
          v_allocated := least(v_lot.quantity_remaining, v_qty_needed);
          update public.product_stock_lots
            set quantity_remaining = quantity_remaining - v_allocated
            where id = v_lot.id;
          insert into public.invoice_item_stock_allocations (
            organization_id, invoice_id, invoice_item_id, product_id, stock_lot_id, quantity, unit_cost
          ) values (
            v_org_id, v_invoice_id, v_item_id, v_product.id, v_lot.id, v_allocated, v_lot.unit_cost
          );
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
          raise exception 'Not enough stock available for % to complete this sale (needed: %, short by: %)',
            v_product.name, v_qty, v_qty_needed using errcode = 'P0001';
        end if;

        v_unit_cost := v_total_cost / v_qty;

        update public.invoice_items
          set purchase_price = v_unit_cost
          where id = v_item_id;

        update public.products
          set stock_quantity = stock_quantity - v_qty
          where id = v_product.id;

        v_allocated_bill_discount := 0;
        if v_total_product_revenue > 0 then
          v_allocated_bill_discount := round(((v_line_total / v_total_product_revenue) * coalesce(p_discount_total, 0)), 2);
        end if;
        v_effective_line_revenue := greatest(v_line_total - v_allocated_bill_discount, 0);

        -- Loss-override check: block unless product flag OR per-checkout override is set
        if not v_product.allow_sell_at_loss and not v_effective_loss_override and v_effective_line_revenue < v_total_cost then
          raise exception 'This sale needs manager approval because the price for % is below cost. Adjust the price/discount or ask an admin to approve.',
            v_product.name using errcode = 'P0001';
        end if;

        update public.invoice_items
          set
            allow_sell_at_loss_snapshot = v_product.allow_sell_at_loss,
            loss_override_reason_snapshot = coalesce(v_product.sell_at_loss_reason, ''),
            effective_unit_price_snapshot = round(v_effective_line_revenue / v_qty, 2),
            loss_amount_snapshot = greatest(v_total_cost - v_effective_line_revenue, 0)
          where id = v_item_id;

        -- Record every below-cost sale to audit_logs (-> loss_prevention_events via trigger)
        if v_effective_line_revenue < v_total_cost and (v_product.allow_sell_at_loss or v_effective_loss_override) then
          insert into public.audit_logs (
            organization_id, branch_id, actor_id, module, action, details, metadata
          ) values (
            v_org_id, v_branch_id, v_profile_id, 'pos', 'pos.loss_sale_completed',
            'Below-cost sale completed for product: ' || v_product.name || ' (Loss: Rs. ' || (v_total_cost - v_effective_line_revenue)::text || ') under approved override: "' || coalesce(v_product.sell_at_loss_reason, case when v_effective_loss_override then 'Staff permission' else '' end) || '"',
            jsonb_build_object(
              'product_id', v_product.id,
              'product_name', v_product.name,
              'invoice_id', v_invoice_id,
              'invoice_no', v_invoice_no,
              'fifo_cost', v_total_cost,
              'effective_revenue', v_effective_line_revenue,
              'loss_amount', v_total_cost - v_effective_line_revenue,
              'override_reason', coalesce(v_product.sell_at_loss_reason, case when v_effective_loss_override then 'Staff permission' else '' end),
              'staff_permission_override', v_effective_loss_override
            )
          );
        end if;
      end;
    else
      declare
        v_item_id uuid := gen_random_uuid();
      begin
        insert into public.invoice_items (
          id, organization_id, invoice_id, product_id, product_name, product_type,
          quantity, purchase_price, unit_price, item_discount, line_total,
          service_provider, service_direction, service_account_number,
          service_receiver_account, service_reference_no,
          service_transaction_amount, service_commission, service_total_charged,
          service_note,
          allow_sell_at_loss_snapshot, loss_override_reason_snapshot,
          effective_unit_price_snapshot, loss_amount_snapshot
        ) values (
          v_item_id, v_org_id, v_invoice_id, v_product.id, v_product.name, v_product.type,
          v_qty, 0, v_unit_price, v_line_discount, v_line_total,
          v_svc_provider, v_svc_direction, v_svc_account,
          v_svc_receiver, v_svc_reference,
          v_svc_principal, v_svc_commission, v_svc_total_charged,
          v_svc_note,
          false, '', round(v_line_total / v_qty, 2), 0
        );
      end;
    end if;
  end loop;

  if v_amount_settled > 0 then
    insert into public.payments (
      organization_id, branch_id, invoice_id, customer_id,
      method, amount, reference_no, received_by
    ) values (
      v_org_id, v_branch_id, v_invoice_id, p_customer_id,
      p_payment_method, v_amount_settled, nullif(p_payment_ref, ''), v_profile_id
    );
  end if;

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

  return query select v_invoice_id, v_invoice_no, false;
end;
$$;

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
  -- Both supplier ledger movements must be whole-paisa values before any writes.
  if v_grand::text in ('NaN', 'Infinity', '-Infinity') or v_grand <> round(v_grand, 2) then
    raise exception 'Amount must have no more than 2 decimal places.' using errcode = 'P0001';
  end if;

  if coalesce(p_amount_paid, 0)::text in ('NaN', 'Infinity', '-Infinity') or coalesce(p_amount_paid, 0) <> round(coalesce(p_amount_paid, 0), 2) then
    raise exception 'Amount must have no more than 2 decimal places.' using errcode = 'P0001';
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

commit;

-- Migration 0031: Upgrade record_supplier_payment with FIFO allocation
--
-- When p_purchase_id IS NULL (on-account payment), allocate the payment
-- to the supplier's oldest unpaid/partial purchases first, mirroring the
-- customer-side record_credit_payment algorithm (0026).
--
-- When p_purchase_id IS PROVIDED, behaviour is unchanged (apply to that
-- one purchase).
--
-- The total reduction in suppliers.outstanding_balance is IDENTICAL to
-- before — only the per-purchase distribution is new.

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

grant execute on function public.record_supplier_payment(
  uuid, uuid, uuid, public.payment_method, numeric, text, text
) to authenticated, service_role;

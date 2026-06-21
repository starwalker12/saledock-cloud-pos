-- Migration: soften internal/jargon wording in user-facing RPC business errors
--
-- Text-only follow-up to PR #264. The app intentionally passes through SQLSTATE
-- P0001 messages (our `raise exception` business rules). A few of those messages
-- contained internal wording ("FIFO lot cost", "FIFO allocation", "stock lot
-- batches") or exposed the product cost price to cashiers. This migration
-- rewords ONLY those user-facing message strings to be shop-owner friendly.
--
-- No logic/formula/signature/schema/grant changes: each function below is the
-- current production body recreated via CREATE OR REPLACE with the SAME
-- signature; only the quoted message text (and, for the below-cost block, the
-- now-unused display arguments) changed. The numeric values are still computed
-- and used in the rule conditions — they are simply no longer shown.
--
-- Functions touched: pos_checkout (10-arg), create_invoice_return, adjust_stock.
-- (record_credit_payment / record_supplier_payment contain "FIFO" only in code
-- comments — not user-facing — and are intentionally left unchanged. The legacy
-- 8-arg pos_checkout overload is unused by the app and left as-is.)

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
    v_line_total := greatest((v_unit_price * v_qty) - v_line_discount, 0);
    v_subtotal := v_subtotal + v_line_total;

    if v_product.type = 'service' then
      v_svc_principal     := coalesce(nullif(v_item->>'service_transaction_amount','')::numeric, 0);
      v_svc_commission    := coalesce(nullif(v_item->>'service_commission','')::numeric, 0);
      v_svc_total_charged := coalesce(nullif(v_item->>'service_total_charged','')::numeric, v_svc_principal + v_svc_commission);
      v_svc_provider      := nullif(trim(coalesce(v_item->>'service_provider', '')), '');
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
        if not v_product.allow_sell_at_loss and not p_allow_loss_override and v_effective_line_revenue < v_total_cost then
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
        if v_effective_line_revenue < v_total_cost and (v_product.allow_sell_at_loss or p_allow_loss_override) then
          insert into public.audit_logs (
            organization_id, branch_id, actor_id, module, action, details, metadata
          ) values (
            v_org_id, v_branch_id, v_profile_id, 'pos', 'pos.loss_sale_completed',
            'Below-cost sale completed for product: ' || v_product.name || ' (Loss: Rs. ' || (v_total_cost - v_effective_line_revenue)::text || ') under approved override: "' || coalesce(v_product.sell_at_loss_reason, case when p_allow_loss_override then 'Staff permission' else '' end) || '"',
            jsonb_build_object(
              'product_id', v_product.id,
              'product_name', v_product.name,
              'invoice_id', v_invoice_id,
              'invoice_no', v_invoice_no,
              'fifo_cost', v_total_cost,
              'effective_revenue', v_effective_line_revenue,
              'loss_amount', v_total_cost - v_effective_line_revenue,
              'override_reason', coalesce(v_product.sell_at_loss_reason, case when p_allow_loss_override then 'Staff permission' else '' end),
              'staff_permission_override', p_allow_loss_override
            )
          );
        end if;
      end;
    else
      declare
        v_item_id uuid := gen_random_uuid();
      begin
        v_svc_principal     := coalesce(nullif(v_item->>'service_transaction_amount','')::numeric, 0);
        v_svc_commission    := coalesce(nullif(v_item->>'service_commission','')::numeric, 0);
        v_svc_total_charged := coalesce(nullif(v_item->>'service_total_charged','')::numeric, v_svc_principal + v_svc_commission);
        v_svc_provider      := nullif(trim(coalesce(v_item->>'service_provider', '')), '');
        v_svc_direction     := nullif(trim(coalesce(v_item->>'service_direction', '')), '');
        v_svc_account       := nullif(trim(coalesce(v_item->>'service_account_number', '')), '');
        v_svc_receiver      := nullif(trim(coalesce(v_item->>'service_receiver_account', '')), '');
        v_svc_reference     := nullif(trim(coalesce(v_item->>'service_reference_no', '')), '');
        v_svc_note          := nullif(trim(coalesce(v_item->>'service_note', '')), '');

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

create or replace function public.create_invoice_return(
  p_invoice_id uuid,
  p_items jsonb,
  p_refund_amount numeric,
  p_refund_method text,
  p_reference_number text,
  p_notes text
)
returns table(return_id uuid, return_no text, subtotal numeric, refund_amount numeric)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_profile_id uuid;
  v_branch_id uuid;
  v_role public.user_role;
  v_invoice record;
  v_return_id uuid := gen_random_uuid();
  v_return_no text;
  v_seq integer;
  v_item jsonb;
  v_invoice_item record;
  v_requested_qty integer;
  v_already_returned integer;
  v_returnable_qty integer;
  v_restock boolean;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_refund_amount numeric := coalesce(p_refund_amount, 0);
  v_return_item_id uuid;
  v_qty_to_restore integer;
  v_lot record;
  v_lot_already_returned integer;
  v_lot_returnable integer;
  v_restore_qty integer;
  v_curr_balance numeric;
  v_balance_credit numeric;
  v_balance_after numeric;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '28000'; end if;

  select id, organization_id, branch_id, role
    into v_profile_id, v_org_id, v_branch_id, v_role
    from public.profiles
    where id = v_user_id and is_active = true;
  if v_org_id is null then raise exception 'No active profile' using errcode = 'P0001'; end if;
  if v_role not in ('owner', 'admin', 'manager') then
    raise exception 'You do not have permission to process returns' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Select at least one item to return' using errcode = 'P0001';
  end if;

  if v_refund_amount < 0 then
    raise exception 'Refund amount cannot be negative' using errcode = 'P0001';
  end if;

  if p_refund_method is not null and p_refund_method not in ('cash', 'card', 'easypaisa', 'jazzcash', 'bank_transfer') then
    raise exception 'Invalid refund method' using errcode = 'P0001';
  end if;

  select id, organization_id, branch_id, customer_id, invoice_no, status
    into v_invoice
    from public.invoices
    where id = p_invoice_id and organization_id = v_org_id
    for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0001'; end if;
  if v_invoice.status = 'void' then raise exception 'Cannot return a void invoice' using errcode = 'P0001'; end if;

  perform 1 from public.organizations where id = v_org_id for update;
  select coalesce(
    max(nullif(regexp_replace(returns.return_no, '\D', '', 'g'), '')::int),
    0
  ) + 1
    into v_seq
    from public.returns
    where organization_id = v_org_id;
  v_return_no := 'RET-' || lpad(v_seq::text, 6, '0');

  insert into public.returns (
    id, organization_id, branch_id, invoice_id, customer_id, return_no,
    subtotal, refund_amount, refund_method, reference_number, notes, created_by
  ) values (
    v_return_id, v_org_id, v_invoice.branch_id, p_invoice_id, v_invoice.customer_id, v_return_no,
    0, 0, nullif(p_refund_method, ''), nullif(p_reference_number, ''), nullif(p_notes, ''), v_profile_id
  );

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_requested_qty := coalesce((v_item->>'quantity')::integer, 0);
    if v_requested_qty <= 0 then
      continue;
    end if;
    v_restock := coalesce((v_item->>'restock')::boolean, true);

    select id, organization_id, invoice_id, product_id, product_name, product_type, quantity, unit_price, line_total
      into v_invoice_item
      from public.invoice_items
      where id = (v_item->>'invoice_item_id')::uuid
        and invoice_id = p_invoice_id
        and organization_id = v_org_id
      for update;
    if not found then raise exception 'Invoice item not found for this invoice' using errcode = 'P0001'; end if;

    select coalesce(sum(quantity), 0)
      into v_already_returned
      from public.return_items ri
      join public.returns r on r.id = ri.return_id
      where ri.invoice_item_id = v_invoice_item.id
        and r.status = 'completed'
        and ri.organization_id = v_org_id;

    v_returnable_qty := v_invoice_item.quantity - coalesce(v_already_returned, 0);
    if v_requested_qty > v_returnable_qty then
      raise exception 'Cannot return % units of %. Only % remain returnable.',
        v_requested_qty, v_invoice_item.product_name, v_returnable_qty using errcode = 'P0001';
    end if;

    v_line_total := round((v_invoice_item.line_total / v_invoice_item.quantity) * v_requested_qty, 2);
    v_return_item_id := gen_random_uuid();

    insert into public.return_items (
      id, organization_id, return_id, invoice_id, invoice_item_id, product_id,
      item_name, item_type, quantity, unit_price, line_total, restock
    ) values (
      v_return_item_id, v_org_id, v_return_id, p_invoice_id, v_invoice_item.id, v_invoice_item.product_id,
      v_invoice_item.product_name, v_invoice_item.product_type::text, v_requested_qty,
      v_invoice_item.unit_price, v_line_total,
      case when v_invoice_item.product_type = 'product' then v_restock else false end
    );

    v_subtotal := v_subtotal + v_line_total;

    if v_invoice_item.product_type = 'product' and v_restock then
      v_qty_to_restore := v_requested_qty;

      for v_lot in
        select stock_lot_id, quantity, unit_cost, created_at
        from public.invoice_item_stock_allocations
        where invoice_item_id = v_invoice_item.id
          and organization_id = v_org_id
        order by created_at asc
        for update
      loop
        if v_qty_to_restore <= 0 then
          exit;
        end if;

        select coalesce(sum(rsa.quantity), 0)
          into v_lot_already_returned
          from public.return_stock_allocations rsa
          join public.return_items ri on ri.id = rsa.return_item_id
          join public.returns r on r.id = rsa.return_id
          where ri.invoice_item_id = v_invoice_item.id
            and rsa.stock_lot_id = v_lot.stock_lot_id
            and r.status = 'completed'
            and rsa.organization_id = v_org_id;

        v_lot_returnable := v_lot.quantity - coalesce(v_lot_already_returned, 0);
        if v_lot_returnable <= 0 then
          continue;
        end if;

        v_restore_qty := least(v_qty_to_restore, v_lot_returnable);

        update public.product_stock_lots
          set quantity_remaining = quantity_remaining + v_restore_qty
          where id = v_lot.stock_lot_id
            and organization_id = v_org_id;

        insert into public.return_stock_allocations (
          organization_id, return_id, return_item_id, product_id, stock_lot_id, quantity, unit_cost
        ) values (
          v_org_id, v_return_id, v_return_item_id, v_invoice_item.product_id, v_lot.stock_lot_id,
          v_restore_qty, v_lot.unit_cost
        );

        insert into public.stock_movements (
          organization_id, branch_id, product_id, stock_lot_id, movement_type,
          quantity, unit_cost, reference_type, reference_id, invoice_id, invoice_item_id, notes, created_by
        ) values (
          v_org_id, v_invoice.branch_id, v_invoice_item.product_id, v_lot.stock_lot_id, 'return_in',
          v_restore_qty, v_lot.unit_cost, 'return', v_return_id, p_invoice_id, v_invoice_item.id,
          'Invoice return ' || v_return_no, v_profile_id
        );

        v_qty_to_restore := v_qty_to_restore - v_restore_qty;
      end loop;

      if v_qty_to_restore > 0 then
        raise exception 'We couldn''t complete this return for % because the original stock records are incomplete (short by % units).',
          v_invoice_item.product_name, v_qty_to_restore using errcode = 'P0001';
      end if;

      update public.products
        set stock_quantity = stock_quantity + v_requested_qty
        where id = v_invoice_item.product_id
          and organization_id = v_org_id;
    end if;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'No returnable quantity selected' using errcode = 'P0001';
  end if;

  if v_refund_amount > v_subtotal then
    raise exception 'Refund amount cannot exceed return subtotal' using errcode = 'P0001';
  end if;
  if v_refund_amount > 0 and nullif(p_refund_method, '') is null then
    raise exception 'Refund method is required when refund amount is greater than zero' using errcode = 'P0001';
  end if;

  if v_invoice.customer_id is not null then
    select outstanding_balance
      into v_curr_balance
      from public.customers
      where id = v_invoice.customer_id and organization_id = v_org_id
      for update;

    v_balance_credit := least(coalesce(v_curr_balance, 0), v_subtotal);
    if v_balance_credit > 0 then
      v_balance_after := greatest(coalesce(v_curr_balance, 0) - v_balance_credit, 0);

      update public.customers
        set outstanding_balance = v_balance_after
        where id = v_invoice.customer_id
          and organization_id = v_org_id;

      insert into public.customer_ledger_entries (
        organization_id, branch_id, customer_id, invoice_id, entry_type, direction,
        amount, balance_after, description, reference_number, created_by
      ) values (
        v_org_id, v_invoice.branch_id, v_invoice.customer_id, p_invoice_id, 'refund', 'credit',
        v_balance_credit, v_balance_after,
        'Return ' || v_return_no || ' credit for invoice ' || v_invoice.invoice_no,
        v_return_no, v_profile_id
      );
    end if;
  end if;

  update public.returns
    set subtotal = v_subtotal,
        refund_amount = v_refund_amount
    where id = v_return_id;

  insert into public.audit_logs (
    organization_id, branch_id, actor_id, module, action, details, metadata
  ) values (
    v_org_id, v_invoice.branch_id, v_profile_id, 'returns', 'return.completed',
    'Processed return ' || v_return_no || ' for invoice ' || v_invoice.invoice_no,
    jsonb_build_object(
      'return_id', v_return_id,
      'invoice_id', p_invoice_id,
      'subtotal', v_subtotal,
      'refund_amount', v_refund_amount,
      'refund_method', nullif(p_refund_method, '')
    )
  );

  return query select v_return_id, v_return_no, v_subtotal, v_refund_amount;
end;
$$;

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
      raise exception 'Not enough stock is available to complete this adjustment.' using errcode = 'P0001';
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

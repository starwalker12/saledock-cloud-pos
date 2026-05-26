-- Add columns for administrative below-cost sale override to products table
alter table public.products
  add column allow_sell_at_loss boolean not null default false,
  add column sell_at_loss_reason text not null default '',
  add column sell_at_loss_updated_at timestamptz null,
  add column sell_at_loss_updated_by uuid references public.profiles(id) on delete set null;

-- Add snapshot and auditing columns to invoice_items table
alter table public.invoice_items
  add column allow_sell_at_loss_snapshot boolean not null default false,
  add column loss_override_reason_snapshot text not null default '',
  add column effective_unit_price_snapshot numeric(12,2) null,
  add column loss_amount_snapshot numeric(12,2) null;

-- Rewrite public.pos_checkout function to enforce below-cost sale protection
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
  
  -- Loss Prevention variables
  v_total_product_revenue numeric := 0;
  v_allocated_bill_discount numeric := 0;
  v_effective_line_revenue numeric := 0;
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
    max(nullif(regexp_replace(invoices.invoice_no, '\D', '', 'g'), '')::int),
    0
  ) + 1
    into v_seq
    from public.invoices
    where organization_id = v_org_id;
  v_invoice_no := 'INV-' || lpad(v_seq::text, 6, '0');

  -- Pre-calculate total physical products revenue after line discounts for proportional bill discount allocation
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

  -- Validate cart, lock products, accumulate subtotal
  for v_item in select * from jsonb_array_elements(p_cart) loop
    select id, name, type, sale_price, purchase_price, stock_quantity, is_active, allow_sell_at_loss, sell_at_loss_reason
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
        -- Insert into invoice items first with placeholder purchase price to avoid FK constraint violation
        insert into public.invoice_items (
          id, organization_id, invoice_id, product_id, product_name, product_type,
          quantity, purchase_price, unit_price, item_discount, line_total
        ) values (
          v_item_id, v_org_id, v_invoice_id, v_product.id, v_product.name, v_product.type,
          v_qty, 0, v_unit_price, v_line_discount, v_line_total
        );

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

        -- Calculate weighted average purchase price and update the invoice item row
        v_unit_cost := v_total_cost / v_qty;

        update public.invoice_items
        set purchase_price = v_unit_cost
        where id = v_item_id;

        -- Update product global stock quantity
        update public.products
        set stock_quantity = stock_quantity - v_qty
        where id = v_product.id;

        -- Proportional bill discount calculation
        v_allocated_bill_discount := 0;
        if v_total_product_revenue > 0 then
          v_allocated_bill_discount := round(((v_line_total / v_total_product_revenue) * coalesce(p_discount_total, 0)), 2);
        end if;
        v_effective_line_revenue := greatest(v_line_total - v_allocated_bill_discount, 0);

        -- Loss Prevention Check
        if not v_product.allow_sell_at_loss and v_effective_line_revenue < v_total_cost then
          raise exception 'Below-cost sale blocked for % (Effective price/revenue: Rs. %, FIFO lot cost: Rs. %). Adjust price/discount or ask admin for override.',
            v_product.name, v_effective_line_revenue, v_total_cost using errcode = 'P0001';
        end if;

        -- Update invoice item with snapshot values
        update public.invoice_items
        set 
          allow_sell_at_loss_snapshot = v_product.allow_sell_at_loss,
          loss_override_reason_snapshot = coalesce(v_product.sell_at_loss_reason, ''),
          effective_unit_price_snapshot = round(v_effective_line_revenue / v_qty, 2),
          loss_amount_snapshot = greatest(v_total_cost - v_effective_line_revenue, 0)
        where id = v_item_id;

        -- Audit log actual override sales
        if v_effective_line_revenue < v_total_cost and v_product.allow_sell_at_loss then
          insert into public.audit_logs (
            organization_id, branch_id, actor_id, module, action, details, metadata
          ) values (
            v_org_id, v_branch_id, v_profile_id, 'pos', 'pos.loss_sale_completed',
            'Below-cost sale completed for product: ' || v_product.name || ' (Loss: Rs. ' || (v_total_cost - v_effective_line_revenue)::text || ') under approved admin override: "' || coalesce(v_product.sell_at_loss_reason, '') || '"',
            jsonb_build_object(
              'product_id', v_product.id,
              'product_name', v_product.name,
              'invoice_id', v_invoice_id,
              'invoice_no', v_invoice_no,
              'fifo_cost', v_total_cost,
              'effective_revenue', v_effective_line_revenue,
              'loss_amount', v_total_cost - v_effective_line_revenue,
              'override_reason', v_product.sell_at_loss_reason
            )
          );
        end if;
      end;
    else
      -- For services, insert directly into invoice items without stock lots or allocations
      declare
        v_item_id uuid := gen_random_uuid();
      begin
        insert into public.invoice_items (
          id, organization_id, invoice_id, product_id, product_name, product_type,
          quantity, purchase_price, unit_price, item_discount, line_total,
          allow_sell_at_loss_snapshot, loss_override_reason_snapshot,
          effective_unit_price_snapshot, loss_amount_snapshot
        ) values (
          v_item_id, v_org_id, v_invoice_id, v_product.id, v_product.name, v_product.type,
          v_qty, 0, v_unit_price, v_line_discount, v_line_total,
          false, '', round(v_line_total / v_qty, 2), 0
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

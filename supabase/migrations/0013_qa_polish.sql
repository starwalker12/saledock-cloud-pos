-- QA polish + parity bundle (additive, safe, no breaking change).
--
-- 1) loss_prevention_events table — durable record of override changes
--    and below-cost sale completions. Lives alongside audit_logs.
-- 2) trigger on audit_logs to copy pos.loss_sale_completed events into
--    loss_prevention_events automatically (no RPC body change needed).
-- 3) pos_checkout signature unchanged; body updated to enforce per-
--    product service requires_provider / requires_account_number /
--    requires_reference flags. Existing carts that satisfy the flags
--    or use non-service products are unaffected.

-- ===========================================================
-- (1) loss_prevention_events
-- ===========================================================

create table if not exists public.loss_prevention_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'override_enabled',
    'override_disabled',
    'override_reason_changed',
    'loss_sale_completed'
  )),
  reason text,
  cost_amount numeric(12,2),
  effective_sale_amount numeric(12,2),
  loss_amount numeric(12,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lp_events_org_created
  on public.loss_prevention_events(organization_id, created_at desc);
create index if not exists idx_lp_events_product
  on public.loss_prevention_events(product_id);
create index if not exists idx_lp_events_invoice
  on public.loss_prevention_events(invoice_id);

alter table public.loss_prevention_events enable row level security;

-- Mirror the org-scoped policy pattern used by audit_logs.
create policy "Org scoped loss prevention event read"
on public.loss_prevention_events for select
to authenticated
using (organization_id = public.current_organization_id());

create policy "Org scoped loss prevention event insert"
on public.loss_prevention_events for insert
to authenticated
with check (organization_id = public.current_organization_id());

-- ===========================================================
-- (2) Trigger: copy pos.loss_sale_completed audit rows into loss_prevention_events
--     so we get a structured record without touching pos_checkout's body.
-- ===========================================================

create or replace function public.copy_loss_sale_to_events()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.module = 'pos' and new.action = 'pos.loss_sale_completed' then
    insert into public.loss_prevention_events (
      organization_id, branch_id, product_id, invoice_id, actor_id,
      event_type, reason, cost_amount, effective_sale_amount, loss_amount, metadata
    ) values (
      new.organization_id,
      new.branch_id,
      nullif(new.metadata->>'product_id', '')::uuid,
      nullif(new.metadata->>'invoice_id', '')::uuid,
      new.actor_id,
      'loss_sale_completed',
      coalesce(new.metadata->>'override_reason', ''),
      nullif(new.metadata->>'fifo_cost', '')::numeric,
      nullif(new.metadata->>'effective_revenue', '')::numeric,
      nullif(new.metadata->>'loss_amount', '')::numeric,
      new.metadata
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_copy_loss_sale_to_events on public.audit_logs;
create trigger trg_copy_loss_sale_to_events
  after insert on public.audit_logs
  for each row execute function public.copy_loss_sale_to_events();

-- ===========================================================
-- (3) pos_checkout body update — enforce per-product service required flags.
-- Signature unchanged (revoke/grant from 0012 stays in force on same identity).
-- All non-service product behaviour is preserved verbatim from 0011/0009.
-- ===========================================================

create or replace function public.pos_checkout(
  p_branch_id uuid,
  p_customer_id uuid,
  p_cart jsonb,
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
      raise exception 'Insufficient stock for % (have %, need %)',
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

      if v_svc_principal < 0 then raise exception 'Service principal must be 0 or more' using errcode = 'P0001'; end if;
      if v_svc_commission < 0 then raise exception 'Service commission must be 0 or more' using errcode = 'P0001'; end if;
      if v_svc_total_charged < v_svc_commission then
        raise exception 'Service total charged (%) cannot be less than commission (%)',
          v_svc_total_charged, v_svc_commission using errcode = 'P0001';
      end if;

      -- Per-product required-field enforcement (new in 0013).
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
  v_balance := greatest(v_grand - coalesce(p_amount_paid, 0), 0);

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
          raise exception 'Insufficient stock lot batches available for product % (needed %, short by %)',
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

        if not v_product.allow_sell_at_loss and v_effective_line_revenue < v_total_cost then
          raise exception 'Below-cost sale blocked for % (Effective price/revenue: Rs. %, FIFO lot cost: Rs. %). Adjust price/discount or ask admin for override.',
            v_product.name, v_effective_line_revenue, v_total_cost using errcode = 'P0001';
        end if;

        update public.invoice_items
          set
            allow_sell_at_loss_snapshot = v_product.allow_sell_at_loss,
            loss_override_reason_snapshot = coalesce(v_product.sell_at_loss_reason, ''),
            effective_unit_price_snapshot = round(v_effective_line_revenue / v_qty, 2),
            loss_amount_snapshot = greatest(v_total_cost - v_effective_line_revenue, 0)
          where id = v_item_id;

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

  if coalesce(p_amount_paid, 0) > 0 then
    insert into public.payments (
      organization_id, branch_id, invoice_id, customer_id,
      method, amount, reference_no, received_by
    ) values (
      v_org_id, v_branch_id, v_invoice_id, p_customer_id,
      p_payment_method, p_amount_paid, nullif(p_payment_ref, ''), v_profile_id
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

  return query select v_invoice_id, v_invoice_no;
end;
$$;

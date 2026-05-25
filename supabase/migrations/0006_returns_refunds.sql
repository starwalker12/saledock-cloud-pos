-- Migration 0006: Returns & Refunds Foundation
-- Adds invoice-linked returns, stock-lot restoration records, and an atomic return RPC.

create table public.returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  return_no text not null,
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  refund_amount numeric(12,2) not null default 0 check (refund_amount >= 0),
  refund_method text check (refund_method is null or refund_method in ('cash', 'card', 'easypaisa', 'jazzcash', 'bank_transfer')),
  reference_number text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, return_no)
);

create table public.return_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  return_id uuid not null references public.returns(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  invoice_item_id uuid not null references public.invoice_items(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  item_name text not null,
  item_type text not null check (item_type in ('product', 'service')),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  restock boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.return_stock_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  return_id uuid not null references public.returns(id) on delete cascade,
  return_item_id uuid not null references public.return_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  stock_lot_id uuid not null references public.product_stock_lots(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

alter table public.returns enable row level security;
alter table public.return_items enable row level security;
alter table public.return_stock_allocations enable row level security;

create policy "Org scoped returns access"
on public.returns for all
to authenticated
using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

create policy "Org scoped return items access"
on public.return_items for all
to authenticated
using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

create policy "Org scoped return stock allocations access"
on public.return_stock_allocations for all
to authenticated
using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

create index idx_returns_org_created on public.returns(organization_id, created_at desc);
create index idx_returns_invoice on public.returns(invoice_id, created_at desc);
create index idx_return_items_invoice_item on public.return_items(invoice_item_id);
create index idx_return_items_return on public.return_items(return_id);
create index idx_return_stock_allocations_return on public.return_stock_allocations(return_id);
create index idx_return_stock_allocations_lot on public.return_stock_allocations(stock_lot_id);

create trigger set_returns_updated_at
before update on public.returns
for each row execute function public.set_updated_at();

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
        raise exception 'Cannot restock %. Original FIFO allocation is incomplete by % units.',
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

grant execute on function public.create_invoice_return(
  uuid, jsonb, numeric, text, text, text
) to authenticated;

-- Exact future returns only. Legacy/imported evidence is never promoted.
begin;

lock table public.profiles, public.staff_permissions, public.organizations,
  public.branches, public.customers, public.products, public.product_stock_lots,
  public.invoices, public.invoice_items, public.invoice_item_stock_allocations,
  public.payments, public.credit_payments, public.customer_write_offs,
  public.returns, public.return_items, public.return_stock_allocations,
  public.stock_movements, public.customer_ledger_entries, public.audit_logs,
  backup_private.organization_identity_locks, backup_private.jobs,
  backup_private.staged_rows, ledger_private.customer_anchors
  in access exclusive mode nowait;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_trigger t
    join pg_catalog.pg_proc p on p.oid = t.tgfoid
    join pg_catalog.pg_locks l on l.relation = t.tgrelid
    where l.pid = pg_backend_pid() and l.mode = 'AccessExclusiveLock' and l.granted
      and not t.tgisinternal and pg_catalog.pg_get_userbyid(p.proowner) not in
      ('postgres', 'supabase_admin', 'backup_identity_executor',
       'backup_import_executor', 'ledger_posting_executor', 'ledger_reset_executor')
  ) then
    raise exception 'An unreviewed database callback blocks return cutover. Contact an administrator.' using errcode = '42501';
  end if;
end;
$$;

alter table public.returns
  add column return_math_version smallint check (return_math_version = 1),
  add column debt_relief numeric(12,2) check (debt_relief >= 0),
  add column restored_cost numeric(12,2) check (restored_cost >= 0),
  add column idempotency_key uuid,
  add column request_payload jsonb,
  add column source_trust_version smallint,
  add column source_effective_at timestamptz,
  add column source_transaction_id xid8,
  add constraint return_v1_settlement check (
    return_math_version is null or (status = 'completed' and debt_relief is not null
      and restored_cost is not null and idempotency_key is not null
      and request_payload is not null and jsonb_typeof(request_payload) = 'object'
      and subtotal = debt_relief + refund_amount));
create unique index return_idempotency_unique on public.returns(organization_id, idempotency_key)
  where idempotency_key is not null;
alter table public.return_items
  add column restock_quantity integer,
  add constraint return_restock_quantity check
    (restock_quantity is null or (restock_quantity between 0 and quantity
      and (item_type = 'product' or restock_quantity = 0))),
  add column source_trust_version smallint,
  add column source_effective_at timestamptz,
  add column source_transaction_id xid8;
alter table public.return_stock_allocations
  add column source_trust_version smallint,
  add column source_effective_at timestamptz,
  add column source_transaction_id xid8;

create table public.invoice_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  credit_payment_id uuid not null references public.credit_payments(id) on delete restrict,
  allocation_kind text not null check (allocation_kind = 'actual_payment'),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default clock_timestamp(),
  source_trust_version smallint,
  source_effective_at timestamptz,
  source_transaction_id xid8,
  unique (credit_payment_id, invoice_id)
);
create index invoice_payment_entitlement on public.invoice_payment_allocations(invoice_id);
create table public.return_item_source_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  return_id uuid not null references public.returns(id) on delete restrict,
  return_item_id uuid not null references public.return_items(id) on delete restrict,
  invoice_item_id uuid not null references public.invoice_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  sale_allocation_id uuid not null references public.invoice_item_stock_allocations(id) on delete restrict,
  stock_lot_id uuid not null references public.product_stock_lots(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  restock_quantity integer not null check (restock_quantity between 0 and quantity),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  created_at timestamptz not null default clock_timestamp(),
  source_trust_version smallint,
  source_effective_at timestamptz,
  source_transaction_id xid8,
  unique (return_item_id, sale_allocation_id)
);
create index return_source_consumption on public.return_item_source_allocations(sale_allocation_id);

-- A Reset-only barrier. Importer identity locks do not block existing-account
-- settlements; the reviewed importer forbids binding imports to those accounts.
grant create on schema ledger_private to backup_identity_executor;
create function ledger_private.lock_return_maintenance(p_org uuid) returns void
language plpgsql security definer set search_path = '' set lock_timeout = '250ms' as $$
begin
  if p_org is distinct from public.current_organization_id() then
    raise exception 'Account identity is unavailable.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(p_org::text,24637));
exception when lock_not_available then
  raise exception 'Account identity is busy. Please retry this operation.' using errcode='PT409';
end;
$$;
alter function ledger_private.lock_return_maintenance(uuid) owner to backup_identity_executor;
revoke create on schema ledger_private from backup_identity_executor;
revoke all on function ledger_private.lock_return_maintenance(uuid) from public,anon,authenticated,service_role;
grant execute on function ledger_private.lock_return_maintenance(uuid) to ledger_posting_executor;
-- UPDATE privilege is required for a row lock. WITH CHECK false does not
-- authorize a Manager organization write; existing settings policy is unchanged.
create policy return_organization_lock on public.organizations for update to ledger_posting_executor
  using (id = public.current_organization_id() and public.current_user_role() in ('owner','admin','manager'))
  with check (false);

create function ledger_private.guard_return_source() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_parent public.returns; v_payment public.credit_payments; v_invoice public.invoices;
begin
  if tg_op <> 'INSERT' then
    if tg_op = 'DELETE' and current_user = 'ledger_reset_executor' then return old; end if;
    raise exception 'Posted return and settlement history cannot be changed or deleted.' using errcode = '42501';
  end if;
  if current_user = 'backup_import_executor' then
    new.source_trust_version := null; new.source_effective_at := null; new.source_transaction_id := null;
    return new;
  end if;
  if current_user <> 'ledger_posting_executor' then
    if current_user in ('postgres', 'supabase_admin') and new.source_trust_version is null
      and new.source_effective_at is null and new.source_transaction_id is null then return new; end if;
    raise exception 'Returns require an approved SaleDock transaction.' using errcode = '42501';
  end if;
  if new.source_trust_version is not null or new.source_effective_at is not null
    or new.source_transaction_id is not null then
    raise exception 'Return provenance is assigned by SaleDock.' using errcode = '42501';
  end if;
  if tg_table_name = 'invoice_payment_allocations' then
    select * into strict v_payment from public.credit_payments where id = new.credit_payment_id;
    select * into strict v_invoice from public.invoices where id = new.invoice_id;
    if v_payment.source_trust_version is distinct from 1
      or v_payment.source_transaction_id is distinct from pg_current_xact_id()
      or v_payment.organization_id <> new.organization_id
      or v_payment.customer_id <> new.customer_id or v_invoice.customer_id is distinct from new.customer_id
      or v_invoice.organization_id <> new.organization_id then
      raise exception 'Payment allocation does not match its receipt.' using errcode = '23514';
    end if;
  elsif tg_table_name <> 'returns' then
    select * into strict v_parent from public.returns where id = new.return_id;
    if v_parent.source_trust_version is distinct from 1
      or v_parent.source_transaction_id is distinct from pg_current_xact_id()
      or v_parent.organization_id <> new.organization_id then
      raise exception 'Return detail does not match its transaction.' using errcode = '23514';
    end if;
  elsif new.return_math_version is distinct from 1 then
    raise exception 'A new return requires exact settlement.' using errcode = '23514';
  end if;
  new.source_trust_version := 1;
  new.source_effective_at := clock_timestamp();
  new.source_transaction_id := pg_current_xact_id();
  return new;
end;
$$;
alter function ledger_private.guard_return_source() owner to ledger_posting_executor;
revoke all on function ledger_private.guard_return_source() from public, anon, authenticated, service_role;

do $$
declare t text; p record; c record;
begin
  foreach t in array array['returns', 'return_items', 'return_stock_allocations',
    'invoice_payment_allocations', 'return_item_source_allocations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    for c in select attname from pg_attribute where attrelid = ('public.' || t)::regclass
      and attnum > 0 and not attisdropped loop
      execute format('revoke all (%I) on public.%I from public, anon, authenticated, service_role', c.attname, t);
    end loop;
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t
      and roles && array['public', 'anon', 'authenticated', 'service_role']::name[] loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('grant select on public.%I to authenticated, service_role', t);
    execute format('create policy return_source_read on public.%I for select to authenticated using (organization_id = public.current_organization_id())', t);
    execute format('grant select, insert on public.%I to ledger_posting_executor', t);
    if t in ('invoice_payment_allocations', 'return_item_source_allocations') then
      execute format('create policy return_source_producer on public.%I for all to ledger_posting_executor using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id())', t);
      execute format('grant insert on public.%I to backup_import_executor', t);
      execute format('create policy backup_snapshot_insert on public.%I for insert to backup_import_executor with check (organization_id = backup_private.owner_org())', t);
      execute format('grant select (id) on public.%I to backup_collision_reader', t);
      execute format('create policy backup_native_collision on public.%I for select to backup_collision_reader using (true)', t);
      execute format('grant select, delete on public.%I to ledger_reset_executor', t);
      execute format('create policy ledger_reset_cleanup on public.%I for all to ledger_reset_executor using (true)', t);
    end if;
    execute format('alter table public.%I add constraint return_source_provenance check ((source_trust_version is null and source_effective_at is null and source_transaction_id is null) or (source_trust_version is not null and source_trust_version = 1 and source_effective_at is not null and source_transaction_id is not null))', t);
    execute format('create trigger return_source_guard before insert or update or delete on public.%I for each row execute function ledger_private.guard_return_source()', t);
    execute format('create trigger return_source_truncate before truncate on public.%I for each statement execute function ledger_private.guard_truncate()', t);
  end loop;
end;
$$;
revoke update on public.returns from ledger_posting_executor;

-- A read-only basis, not a new financial writer. NUMERIC multiplication avoids
-- bigint overflow for large amounts/quantities; every division floors paisa.
create function ledger_private.return_basis(p_invoice uuid)
returns table(invoice_item_id uuid, net_minor numeric, discount_minor numeric)
language plpgsql stable security invoker set search_path = '' as $$
declare v_invoice public.invoices; v_sum numeric; v_discount numeric;
begin
  select * into strict v_invoice from public.invoices where id = p_invoice;
  if v_invoice.source_trust_version is distinct from 1 or v_invoice.status = 'void'
    or v_invoice.customer_credit_applied <> 0
    or exists(select 1 from public.invoice_items i where i.invoice_id = p_invoice
      and (i.source_trust_version is distinct from 1 or i.organization_id <> v_invoice.organization_id
        or i.source_transaction_id is distinct from v_invoice.source_transaction_id
        or i.line_total < 0 or i.quantity <= 0)) then
    raise exception 'This invoice was created before SaleDock could fully verify return history. No return was made.' using errcode = 'P0001';
  end if;
  select sum(i.line_total * 100) into v_sum from public.invoice_items i where i.invoice_id = p_invoice;
  v_discount := v_sum - v_invoice.grand_total * 100;
  if v_sum is null or v_sum <> v_invoice.subtotal * 100 or v_discount < 0
    or v_discount > v_sum or v_discount <> least(v_invoice.discount_total * 100, v_sum) then
    raise exception 'The original invoice totals cannot be verified. No return was made.' using errcode = 'P0001';
  end if;
  return query
    with shares as (
      select i.id, i.line_total * 100 as line_minor,
        case when v_sum = 0 then 0 else floor(v_discount * i.line_total * 100 / v_sum) end as base,
        case when v_sum = 0 then 0 else mod(v_discount * i.line_total * 100, v_sum) end as remainder
      from public.invoice_items i where i.invoice_id = p_invoice
    ), ranked as (
      select *, row_number() over(order by remainder desc, id asc) as rank,
        v_discount - sum(base) over() as remaining from shares
    ) select id, line_minor - base - case when rank <= remaining then 1 else 0 end,
      base + case when rank <= remaining then 1 else 0 end from ranked order by id;
end;
$$;
alter function ledger_private.return_basis(uuid) owner to ledger_posting_executor;
revoke all on function ledger_private.return_basis(uuid) from public, anon, authenticated, service_role;

create function ledger_private.return_plan(p_invoice uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles; v_invoice public.invoices; v_item public.invoice_items;
  v_input jsonb; v_rows jsonb := '[]'; v_credit numeric := 0; v_net numeric; v_basis jsonb;
  v_previous_qty integer; v_previous_credit numeric; v_q integer; v_s integer;
  v_line_credit numeric; v_paid numeric; v_net_paid numeric; v_due numeric;
  v_previous_return numeric; v_previous_refund numeric; v_relief numeric;
  v_write_off public.customer_write_offs; v_paid_then numeric; v_net_then numeric;
begin
  if ledger_private.actor_id() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into v_profile from public.profiles where id = ledger_private.actor_id() and is_active;
  if not found or v_profile.organization_id is null then
    raise exception 'No active profile' using errcode = '42501'; end if;
  if v_profile.role not in ('owner', 'admin', 'manager') or
    (v_profile.role = 'manager' and not coalesce((select s.can_return from public.staff_permissions s
      where s.profile_id = v_profile.id and s.organization_id = v_profile.organization_id), true)) then
    raise exception 'You do not have permission to process returns.' using errcode = '42501'; end if;
  select * into v_invoice from public.invoices
    where id = p_invoice and organization_id = v_profile.organization_id;
  if not found then raise exception 'Invoice not found.' using errcode = '42501'; end if;
  if v_profile.branch_id is null or v_invoice.branch_id <> v_profile.branch_id
    or not exists(select 1 from public.branches b where b.id = v_profile.branch_id
      and b.organization_id = v_profile.organization_id and b.is_active) then
    raise exception 'You can only return an invoice from your assigned shop branch.' using errcode = '42501'; end if;
  -- Compute the unchanged largest-remainder basis once for this plan, rather
  -- than recomputing every invoice line for every selected source item.
  -- The mutation caller has already locked the source invoice and its items.
  select jsonb_object_agg(b.invoice_item_id::text, b.net_minor) into v_basis
    from ledger_private.return_basis(p_invoice) b;
  if exists(select 1 from public.returns r where r.invoice_id = p_invoice
    and (r.return_math_version is distinct from 1 or r.source_trust_version is distinct from 1
      or r.status <> 'completed')) then
    raise exception 'SaleDock cannot fully verify the earlier returns on this invoice. No return was made.' using errcode = 'P0001'; end if;
  if exists(select 1 from public.payments p where p.invoice_id = p_invoice
    and (p.source_trust_version is distinct from 1
      or p.source_transaction_id is distinct from v_invoice.source_transaction_id
      or p.customer_id is distinct from v_invoice.customer_id or p.branch_id <> v_invoice.branch_id))
    or exists(select 1 from public.invoice_payment_allocations a
      join public.credit_payments p on p.id = a.credit_payment_id where a.invoice_id = p_invoice
      and (a.source_trust_version is distinct from 1 or p.source_trust_version is distinct from 1
        or a.source_transaction_id is distinct from p.source_transaction_id
        or a.customer_id is distinct from v_invoice.customer_id or p.customer_id <> a.customer_id)) then
    raise exception 'SaleDock cannot fully verify payment history for this invoice. No return was made.' using errcode = 'P0001'; end if;
  select coalesce(sum(p.amount), 0) into v_paid from public.payments p where p.invoice_id = p_invoice;
  select v_paid + coalesce(sum(a.amount), 0) into v_paid
    from public.invoice_payment_allocations a where a.invoice_id = p_invoice;
  select coalesce(sum(r.subtotal), 0), coalesce(sum(r.refund_amount), 0)
    into v_previous_return, v_previous_refund from public.returns r where r.invoice_id = p_invoice;
  v_net_paid := v_paid - v_previous_refund;
  v_due := v_invoice.grand_total - v_previous_return - v_net_paid;
  if v_net_paid < 0 or v_due < 0 or v_net_paid <> v_invoice.amount_paid or v_due <> v_invoice.balance_due
    or (v_invoice.customer_id is null and v_due <> 0) then
    raise exception 'SaleDock cannot fully verify the settlement of this invoice. No return was made.' using errcode = 'P0001'; end if;

  -- Source timestamps are database-owned event evidence, not receipt ordering
  -- from xid8. Legacy write-offs are not promoted or attributed to invoices.
  for v_write_off in select * from public.customer_write_offs w
    where w.customer_id = v_invoice.customer_id and w.source_trust_version = 1
      and w.source_effective_at >= v_invoice.source_effective_at loop
    select coalesce(sum(p.amount), 0) into v_paid_then from public.payments p
      where p.invoice_id = p_invoice and p.source_effective_at < v_write_off.source_effective_at;
    select v_paid_then + coalesce(sum(a.amount), 0) into v_paid_then
      from public.invoice_payment_allocations a where a.invoice_id = p_invoice
        and a.source_effective_at < v_write_off.source_effective_at;
    select v_invoice.grand_total - coalesce(sum(r.subtotal), 0),
      v_paid_then - coalesce(sum(r.refund_amount), 0) into v_net_then, v_paid_then
      from public.returns r where r.invoice_id = p_invoice
        and r.source_effective_at < v_write_off.source_effective_at;
    if v_paid_then <> v_net_then then
      raise exception 'This invoice was still unsettled when customer debt was written off. SaleDock cannot safely process its return.' using errcode = 'P0001';
    end if;
  end loop;
  -- The source invoice is the business limit, with one entry per actual item.
  -- create_invoice_return repeats this plan after locking that source invoice.
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) > (select count(*) from public.invoice_items i
      where i.invoice_id = p_invoice and i.organization_id = v_profile.organization_id)
    or exists(select 1 from jsonb_array_elements(p_items) e where jsonb_typeof(e) <> 'object'
      or not (e ?& array['invoice_item_id', 'quantity', 'restock_quantity'])
      or exists(select 1 from jsonb_object_keys(e) k where k <> all(array['invoice_item_id','quantity','restock_quantity'])))
    or exists(select 1 from jsonb_array_elements(p_items) e group by e->>'invoice_item_id' having count(*) > 1) then
    raise exception 'Choose valid return quantities once per item.' using errcode = '22023'; end if;
  for v_input in select e from jsonb_array_elements(p_items) e order by e->>'invoice_item_id' loop
    if coalesce(v_input->>'quantity', '') !~ '^[0-9]+$'
      or coalesce(v_input->>'restock_quantity', '') !~ '^[0-9]+$' then
      raise exception 'Return and restock quantities must be whole numbers.' using errcode = '22023'; end if;
    -- Lexical validation precedes numeric conversion; INTEGER is the actual
    -- source, return, allocation, lot and product-stock domain.
    if (v_input->>'quantity')::numeric > 2147483647
      or (v_input->>'restock_quantity')::numeric > 2147483647 then
      raise exception 'Choose valid return quantities for this invoice.' using errcode = '22023'; end if;
    v_q := (v_input->>'quantity')::integer; v_s := (v_input->>'restock_quantity')::integer;
    select * into v_item from public.invoice_items i where i.id = (v_input->>'invoice_item_id')::uuid
      and i.invoice_id = p_invoice and i.organization_id = v_profile.organization_id;
    if not found then raise exception 'An item does not belong to this invoice.' using errcode = '42501'; end if;
    if v_s > v_q or (v_item.product_type = 'service' and v_s <> 0) then
      raise exception 'Qty to return to sellable stock cannot exceed the returned quantity. Services have no stock.' using errcode = '22023'; end if;
    if v_q > 0 and v_item.product_type = 'service' and v_item.service_transaction_amount <> 0 then
      raise exception 'This service includes money passed to another provider and cannot be returned here.' using errcode = 'P0001'; end if;
    v_net := (v_basis->>v_item.id::text)::numeric;
    if v_net is null then raise exception 'The original invoice totals cannot be verified. No return was made.' using errcode = 'P0001'; end if;
    select coalesce(sum(i.quantity), 0), coalesce(sum(i.line_total), 0) into v_previous_qty, v_previous_credit
      from public.return_items i where i.invoice_item_id = v_item.id;
    if v_previous_qty > v_item.quantity or v_previous_credit * 100 <> floor(v_net * v_previous_qty / v_item.quantity)
      or exists(select 1 from public.return_items i where i.invoice_item_id = v_item.id
        and i.source_trust_version is distinct from 1) then
      raise exception 'SaleDock cannot fully verify the earlier returns for this item. No return was made.' using errcode = 'P0001'; end if;
    if v_q > v_item.quantity - v_previous_qty then
      raise exception 'Return quantity exceeds the quantity still available to return.' using errcode = 'P0001'; end if;
    v_line_credit := (floor(v_net * (v_previous_qty + v_q) / v_item.quantity)
      - floor(v_net * v_previous_qty / v_item.quantity)) / 100;
    v_credit := v_credit + v_line_credit;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('invoice_item_id', v_item.id,
      'quantity', v_q, 'restock_quantity', v_s, 'credit', v_line_credit::text,
      'net_minor', v_net::bigint::text, 'returned_quantity', v_previous_qty));
  end loop;
  v_relief := least(v_credit, v_due);
  if v_credit - v_relief > v_net_paid then
    raise exception 'The refund exceeds the verified payment for this invoice.' using errcode = 'P0001'; end if;
  if v_relief > 0 and not exists(select 1 from public.customers c where c.id = v_invoice.customer_id
    and c.organization_id = v_profile.organization_id and c.outstanding_balance >= v_relief) then
    raise exception 'SaleDock cannot safely reconcile the remaining debt for this invoice. No return was made.' using errcode = 'P0001'; end if;
  return jsonb_build_object('items', v_rows, 'credit', v_credit::text, 'debt_relief', v_relief::text,
    'refund', (v_credit - v_relief)::text, 'remaining_paid', v_net_paid::text, 'remaining_due', v_due::text);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Choose valid return quantities for this invoice.' using errcode = '22023';
end;
$$;
alter function ledger_private.return_plan(uuid, jsonb) owner to ledger_posting_executor;
revoke all on function ledger_private.return_plan(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function ledger_private.return_plan(uuid, jsonb) to authenticated;
create function public.quote_invoice_return(p_invoice_id uuid, p_items jsonb) returns jsonb
language sql security invoker set search_path = '' begin atomic
  select ledger_private.return_plan(p_invoice_id, p_items);
end;
revoke all on function public.quote_invoice_return(uuid, jsonb) from public, anon, service_role;
grant execute on function public.quote_invoice_return(uuid, jsonb) to authenticated;

create function ledger_private.return_stock_plan(p_invoice uuid, p_plan jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  i public.invoice_items; a public.invoice_item_stock_allocations; l public.product_stock_lots;
  e jsonb; v_q integer; v_s integer; v_used integer; v_take integer; v_restore integer;
  v_rows jsonb := '[]'; v_cost numeric := 0; v_org uuid; v_branch uuid;
begin
  select organization_id, branch_id into v_org, v_branch from public.invoices where id = p_invoice;
  -- The organization mutex is already held. Stable row ordering also coordinates
  -- normal stock writers which do not post customer debt.
  perform 1 from public.products p where p.id in (select x.product_id from public.invoice_items x
    join jsonb_array_elements(p_plan->'items') selected(value) on (selected.value->>'invoice_item_id')::uuid = x.id
    where x.invoice_id = p_invoice and (selected.value->>'quantity')::integer > 0 and x.product_type = 'product')
    order by p.id for update;
  perform 1 from public.product_stock_lots lot where lot.id in (
    select sale.stock_lot_id from public.invoice_item_stock_allocations sale
      join jsonb_array_elements(p_plan->'items') selected(value) on (selected.value->>'invoice_item_id')::uuid = sale.invoice_item_id
      where sale.invoice_id = p_invoice and (selected.value->>'quantity')::integer > 0)
    order by lot.id for update;
  for e in select x from jsonb_array_elements(p_plan->'items') x where (x->>'quantity')::integer > 0 loop
    select * into strict i from public.invoice_items where id = (e->>'invoice_item_id')::uuid;
    if i.product_type = 'service' then continue; end if;
    if i.product_id is null or not exists(select 1 from public.products p where p.id = i.product_id
      and p.organization_id = v_org and (p.branch_id is null or p.branch_id = v_branch)) then
      raise exception 'The original product is not available in this shop branch. No return was made.' using errcode = 'P0001'; end if;
    if (select coalesce(sum(x.quantity), 0) from public.invoice_item_stock_allocations x
      where x.invoice_item_id = i.id) <> i.quantity
      or exists(select 1 from public.invoice_item_stock_allocations x where x.invoice_item_id = i.id
        and (x.source_trust_version is distinct from 1 or x.source_transaction_id is distinct from i.source_transaction_id
          or x.organization_id <> v_org or x.product_id <> i.product_id or x.invoice_id <> p_invoice))
      or (select coalesce(sum(x.quantity), 0) from public.return_item_source_allocations x
          where x.invoice_item_id = i.id) <>
        (select coalesce(sum(x.quantity), 0) from public.return_items x where x.invoice_item_id = i.id) then
      raise exception 'SaleDock cannot fully verify the original stock records for this item. No return was made.' using errcode = 'P0001'; end if;
    v_q := (e->>'quantity')::integer; v_s := (e->>'restock_quantity')::integer;
    for a in select * from public.invoice_item_stock_allocations x where x.invoice_item_id = i.id
      order by x.created_at, x.id loop
      select coalesce(sum(x.quantity), 0) into v_used from public.return_item_source_allocations x
        where x.sale_allocation_id = a.id;
      if v_used > a.quantity then
        raise exception 'The earlier stock returns cannot be verified. No return was made.' using errcode = 'P0001'; end if;
      v_take := least(v_q, a.quantity - v_used);
      if v_take = 0 then continue; end if;
      v_restore := least(v_s, v_take);
      select * into l from public.product_stock_lots where id = a.stock_lot_id;
      if not found or l.organization_id <> v_org or l.product_id <> i.product_id or l.branch_id <> v_branch
        or (v_restore > 0 and not l.is_active) then
        raise exception 'The original stock lot is not available for this return. No return was made.' using errcode = 'P0001'; end if;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('invoice_item_id', i.id,
        'sale_allocation_id', a.id, 'stock_lot_id', a.stock_lot_id, 'product_id', i.product_id,
        'quantity', v_take, 'restock_quantity', v_restore, 'unit_cost', a.unit_cost::text));
      v_cost := v_cost + v_restore * a.unit_cost;
      v_q := v_q - v_take; v_s := v_s - v_restore;
      exit when v_q = 0;
    end loop;
    if v_q <> 0 or v_s <> 0 then
      raise exception 'The original stock records are incomplete. No return was made.' using errcode = 'P0001'; end if;
  end loop;
  return jsonb_build_object('allocations', v_rows, 'restored_cost', v_cost::text);
end;
$$;
alter function ledger_private.return_stock_plan(uuid, jsonb) owner to ledger_posting_executor;
revoke all on function ledger_private.return_stock_plan(uuid, jsonb) from public, anon, authenticated, service_role;

drop function public.create_invoice_return(uuid, jsonb, numeric, text, text, text);
drop function ledger_private.create_invoice_return(uuid, jsonb, numeric, text, text, text);
create function ledger_private.create_invoice_return(
  p_invoice_id uuid, p_items jsonb, p_refund_amount numeric, p_refund_method text,
  p_reference_number text, p_notes text, p_idempotency_key uuid default null
)
returns table(return_id uuid, return_no text, subtotal numeric, refund_amount numeric,
  debt_relief numeric, restored_cost numeric, idempotent_replay boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles; v_invoice public.invoices; v_existing public.returns;
  v_plan jsonb; v_stock jsonb; v_request jsonb; e jsonb; a jsonb;
  v_id uuid := gen_random_uuid(); v_no text; v_item_id uuid; v_item public.invoice_items;
  v_credit numeric; v_refund numeric; v_relief numeric; v_cost numeric;
  v_paid numeric; v_due numeric; v_customer_balance numeric; v_rows integer;
begin
  if ledger_private.actor_id() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into v_profile from public.profiles where id = ledger_private.actor_id() and is_active;
  if not found or v_profile.organization_id is null then raise exception 'No active profile' using errcode = '42501'; end if;
  if v_profile.role not in ('owner', 'admin', 'manager') or
    (v_profile.role = 'manager' and not coalesce((select s.can_return from public.staff_permissions s
      where s.profile_id = v_profile.id and s.organization_id = v_profile.organization_id), true)) then
    raise exception 'You do not have permission to process returns.' using errcode = '42501'; end if;
  if p_idempotency_key is null or p_refund_amount is not null then
    raise exception 'Return amounts are calculated by SaleDock. Reopen the return form and try again.' using errcode = '22023'; end if;
  if p_refund_method is not null and p_refund_method <> all(array['cash','card','easypaisa','jazzcash','bank_transfer'])
    or length(coalesce(p_reference_number, '')) > 200 or length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Choose a valid refund method and keep notes brief.' using errcode = '22023'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Select at least one item to return.' using errcode = '22023'; end if;
  v_request := jsonb_build_object('invoice_id', p_invoice_id, 'items',
    (select jsonb_agg(input.value order by input.value->>'invoice_item_id') from jsonb_array_elements(p_items) input(value)),
    'refund_method', p_refund_method, 'reference_number', nullif(btrim(p_reference_number), ''),
    'notes', nullif(btrim(p_notes), ''));
  perform ledger_private.lock_return_maintenance(v_profile.organization_id);
  -- Serialize Returns without blocking settlement foreign-key KEY SHARE locks.
  perform 1 from public.organizations o where o.id = v_profile.organization_id for no key update;
  select * into v_invoice from public.invoices where id = p_invoice_id
    and organization_id = v_profile.organization_id;
  if not found or v_profile.branch_id is null or v_invoice.branch_id <> v_profile.branch_id then
    raise exception 'You can only return an invoice from your assigned shop branch.' using errcode = '42501'; end if;
  select * into v_existing from public.returns r where r.organization_id = v_profile.organization_id
    and r.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_payload is distinct from v_request or v_existing.source_trust_version is distinct from 1 then
      raise exception 'This return request has already been used for different details. No return was made.' using errcode = 'PT409'; end if;
    return query select v_existing.id, v_existing.return_no, v_existing.subtotal,
      v_existing.refund_amount, v_existing.debt_relief, v_existing.restored_cost, true;
    return;
  end if;
  if v_invoice.customer_id is not null then
    select outstanding_balance into v_customer_balance from public.customers c
      where c.id = v_invoice.customer_id and c.organization_id = v_profile.organization_id for update;
    if not found then raise exception 'Customer accounting state is unavailable.' using errcode = '42501'; end if;
  end if;
  select * into strict v_invoice from public.invoices where id=p_invoice_id for update;
  perform 1 from public.invoice_items i where i.invoice_id = p_invoice_id order by i.id for update;
  v_plan := ledger_private.return_plan(p_invoice_id, p_items);
  if not exists(select 1 from jsonb_array_elements(v_plan->'items') selected(value) where (selected.value->>'quantity')::integer > 0) then
    raise exception 'Enter a return quantity for at least one item.' using errcode = '22023'; end if;
  v_stock := ledger_private.return_stock_plan(p_invoice_id, v_plan);
  v_credit := (v_plan->>'credit')::numeric; v_relief := (v_plan->>'debt_relief')::numeric;
  v_refund := (v_plan->>'refund')::numeric; v_cost := (v_stock->>'restored_cost')::numeric;
  if v_refund > 0 and p_refund_method is null then
    raise exception 'Choose how to refund the customer.' using errcode = '22023'; end if;
  select 'RET-' || lpad((coalesce(max(nullif(regexp_replace(r.return_no, '\D', '', 'g'), '')::bigint), 0) + 1)::text, 6, '0')
    into v_no from public.returns r where r.organization_id = v_profile.organization_id;
  insert into public.returns(id, organization_id, branch_id, invoice_id, customer_id, return_no,
    status, subtotal, refund_amount, refund_method, reference_number, notes, created_by,
    return_math_version, debt_relief, restored_cost, idempotency_key, request_payload)
  values(v_id, v_profile.organization_id, v_invoice.branch_id, p_invoice_id, v_invoice.customer_id,
    v_no, 'completed', v_credit, v_refund, case when v_refund > 0 then p_refund_method end,
    nullif(btrim(p_reference_number), ''), nullif(btrim(p_notes), ''), v_profile.id,
    1, v_relief, v_cost, p_idempotency_key, v_request);
  for e in select x from jsonb_array_elements(v_plan->'items') x where (x->>'quantity')::integer > 0 loop
    select * into strict v_item from public.invoice_items where id = (e->>'invoice_item_id')::uuid;
    v_item_id := gen_random_uuid();
    insert into public.return_items(id, organization_id, return_id, invoice_id, invoice_item_id,
      product_id, item_name, item_type, quantity, unit_price, line_total, restock, restock_quantity)
    values(v_item_id, v_profile.organization_id, v_id, p_invoice_id, v_item.id, v_item.product_id,
      v_item.product_name, v_item.product_type, (e->>'quantity')::integer, v_item.unit_price,
      (e->>'credit')::numeric, (e->>'restock_quantity')::integer > 0, (e->>'restock_quantity')::integer);
    for a in select x from jsonb_array_elements(v_stock->'allocations') x
      where x->>'invoice_item_id' = v_item.id::text loop
      insert into public.return_item_source_allocations(organization_id, return_id, return_item_id,
        invoice_item_id, product_id, sale_allocation_id, stock_lot_id, quantity, restock_quantity, unit_cost)
      values(v_profile.organization_id, v_id, v_item_id, v_item.id, v_item.product_id,
        (a->>'sale_allocation_id')::uuid, (a->>'stock_lot_id')::uuid,
        (a->>'quantity')::integer, (a->>'restock_quantity')::integer, (a->>'unit_cost')::numeric);
      if (a->>'restock_quantity')::integer = 0 then continue; end if;
      update public.product_stock_lots set quantity_remaining = quantity_remaining + (a->>'restock_quantity')::integer,
        updated_at = now() where id = (a->>'stock_lot_id')::uuid;
      insert into public.return_stock_allocations(organization_id, return_id, return_item_id, product_id,
        stock_lot_id, quantity, unit_cost) values(v_profile.organization_id, v_id, v_item_id,
        v_item.product_id, (a->>'stock_lot_id')::uuid, (a->>'restock_quantity')::integer, (a->>'unit_cost')::numeric);
      insert into public.stock_movements(organization_id, branch_id, product_id, stock_lot_id,
        movement_type, quantity, unit_cost, reference_type, reference_id, invoice_id, invoice_item_id, notes, created_by)
      values(v_profile.organization_id, v_invoice.branch_id, v_item.product_id, (a->>'stock_lot_id')::uuid,
        'return_in', (a->>'restock_quantity')::integer, (a->>'unit_cost')::numeric, 'return', v_id,
        p_invoice_id, v_item.id, 'Invoice return ' || v_no, v_profile.id);
    end loop;
    if (e->>'restock_quantity')::integer > 0 then
      update public.products set stock_quantity = stock_quantity + (e->>'restock_quantity')::integer,
        updated_at = now() where id = v_item.product_id;
    end if;
  end loop;
  v_paid := (v_plan->>'remaining_paid')::numeric - v_refund;
  v_due := (v_plan->>'remaining_due')::numeric - v_relief;
  update public.invoices set amount_paid = v_paid, balance_due = v_due,
    status = case when v_due = 0 then 'paid'::public.invoice_status
      when v_paid > 0 then 'partial'::public.invoice_status else 'unpaid'::public.invoice_status end
    where id = p_invoice_id;
  if v_relief > 0 then
    update public.customers set outstanding_balance = outstanding_balance - v_relief
      where id = v_invoice.customer_id and outstanding_balance >= v_relief;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'Customer debt changed. No return was made.' using errcode = 'PT409'; end if;
    insert into public.customer_ledger_entries(organization_id, branch_id, customer_id, invoice_id,
      entry_type, direction, amount, balance_after, description, reference_number, created_by)
    values(v_profile.organization_id, v_invoice.branch_id, v_invoice.customer_id, p_invoice_id,
      'refund', 'credit', v_relief, v_customer_balance - v_relief,
      'Return ' || v_no || ' debt relief for invoice ' || v_invoice.invoice_no, v_no, v_profile.id);
  end if;
  insert into public.audit_logs(organization_id, branch_id, actor_id, module, action, details, metadata)
  values(v_profile.organization_id, v_invoice.branch_id, v_profile.id, 'returns', 'return.completed',
    'Processed return ' || v_no || ' for invoice ' || v_invoice.invoice_no,
    jsonb_build_object('return_id', v_id, 'invoice_id', p_invoice_id, 'return_math_version', 1,
      'credit', v_credit, 'debt_relief', v_relief, 'refund', v_refund, 'restored_cost', v_cost));
  return query select v_id, v_no, v_credit, v_refund, v_relief, v_cost, false;
end;
$$;
alter function ledger_private.create_invoice_return(uuid, jsonb, numeric, text, text, text, uuid) owner to ledger_posting_executor;
revoke all on function ledger_private.create_invoice_return(uuid, jsonb, numeric, text, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function ledger_private.create_invoice_return(uuid, jsonb, numeric, text, text, text, uuid) to authenticated, service_role;
create function public.create_invoice_return(
  p_invoice_id uuid, p_items jsonb, p_refund_amount numeric, p_refund_method text,
  p_reference_number text, p_notes text, p_idempotency_key uuid default null
) returns table(return_id uuid, return_no text, subtotal numeric, refund_amount numeric,
  debt_relief numeric, restored_cost numeric, idempotent_replay boolean)
language sql security invoker set search_path = '' begin atomic
  select * from ledger_private.create_invoice_return(p_invoice_id, p_items, p_refund_amount,
    p_refund_method, p_reference_number, p_notes, p_idempotency_key);
end;
revoke all on function public.create_invoice_return(uuid, jsonb, numeric, text, text, text, uuid) from public, anon;
grant execute on function public.create_invoice_return(uuid, jsonb, numeric, text, text, text, uuid) to authenticated, service_role;

-- Mechanical current-main function preservation follows.
CREATE OR REPLACE FUNCTION ledger_private.pos_checkout(p_branch_id uuid, p_customer_id uuid, p_cart jsonb, p_discount_total numeric, p_payment_method payment_method, p_amount_paid numeric, p_payment_ref text, p_note text, p_allow_loss_override boolean DEFAULT false, p_idempotency_key text DEFAULT NULL::text)
 RETURNS TABLE(invoice_id uuid, invoice_no text, idempotent_replay boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_user_id uuid := ledger_private.actor_id();
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

  perform ledger_private.lock_return_maintenance(v_org_id);
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

CREATE OR REPLACE FUNCTION ledger_private.record_credit_payment(p_customer_id uuid, p_amount numeric, p_method credit_payment_method, p_reference_number text, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_user_id uuid := ledger_private.actor_id();
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

  perform ledger_private.lock_return_maintenance(v_org_id);

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

    insert into public.invoice_payment_allocations(organization_id, customer_id, invoice_id,
      credit_payment_id, allocation_kind, amount)
    values(v_org_id, p_customer_id, v_inv.id, v_payment_id, 'actual_payment', v_alloc);

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

CREATE OR REPLACE FUNCTION ledger_private.record_customer_write_off(p_customer_id uuid, p_amount numeric, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_user_id uuid := ledger_private.actor_id();
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

  perform ledger_private.lock_return_maintenance(v_org_id);

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

CREATE OR REPLACE FUNCTION backup_private.core_tables()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $$
  select array['product_categories','suppliers','customers','products','invoices',
    'credit_payments','customer_write_offs','supplier_purchases','supplier_write_offs',
    'product_stock_lots','invoice_items','payments','returns','supplier_payments',
    'customer_ledger_entries','supplier_ledger_entries','invoice_item_stock_allocations',
    'stock_movements','supplier_purchase_items','return_items','return_stock_allocations', 'invoice_payment_allocations', 'return_item_source_allocations']::text[];
$$;

CREATE OR REPLACE FUNCTION backup_private.normalize_row(p_table text, p_payload jsonb, p_org uuid, p_time timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $$
declare v_input jsonb; v_result jsonb; v_bad boolean; v_field record;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or p_payload->>'id' is null then
    raise exception 'A staged row requires an explicit target identity.' using errcode='22023';
  end if;
  -- Imported provenance is never accepted. A later trust cutover defines new restore anchors.
  select coalesce(jsonb_object_agg(key,value),'{}') into v_input from jsonb_each(p_payload)
    where key not in ('posting_sequence','posting_trust_version','posting_effective_at',
      'source_trust_version','source_effective_at','source_transaction_id') and key not like 'ledger_anchor_%';
  if p_table in ('customers','suppliers') and
    (not (v_input ? 'outstanding_balance') or v_input->>'outstanding_balance' is null) then
    raise exception 'This backup does not contain the current % balance required for a safe restore.',
      case when p_table='suppliers' then 'supplier' else 'customer' end using errcode='22023';
  end if;
  case p_table

    when 'product_categories' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','name','is_active','created_at','updated_at','description'])) then
        raise exception 'Unsupported columns for product_categories.' using errcode='22023'; end if;
      v_input := jsonb_build_object('is_active',true,'created_at',p_time,'updated_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.name is null or r.is_active is null or r.created_at is null or r.updated_at is null)
        into v_result,v_bad from jsonb_populate_record(null::public.product_categories,v_input) r;

    when 'suppliers' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','name','company','phone','email','address','notes','is_active','created_at','updated_at','outstanding_balance'])) then
        raise exception 'Unsupported columns for suppliers.' using errcode='22023'; end if;
      v_input := jsonb_build_object('is_active',true,'created_at',p_time,'updated_at',p_time,'outstanding_balance',0) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.name is null or r.is_active is null or r.created_at is null or r.updated_at is null or r.outstanding_balance is null or ((v_input->>'outstanding_balance')::numeric is distinct from r.outstanding_balance and v_input ? 'outstanding_balance'))
        into v_result,v_bad from jsonb_populate_record(null::public.suppliers,v_input) r;

    when 'customers' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','name','phone','email','address','notes','credit_limit','is_archived','archived_at','created_at','updated_at','outstanding_balance'])) then
        raise exception 'Unsupported columns for customers.' using errcode='22023'; end if;
      v_input := jsonb_build_object('credit_limit',0,'is_archived',false,'created_at',p_time,'updated_at',p_time,'outstanding_balance',0) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.name is null or r.credit_limit is null or r.is_archived is null or r.created_at is null or r.updated_at is null or r.outstanding_balance is null or ((v_input->>'credit_limit')::numeric is distinct from r.credit_limit and v_input ? 'credit_limit') or ((v_input->>'outstanding_balance')::numeric is distinct from r.outstanding_balance and v_input ? 'outstanding_balance'))
        into v_result,v_bad from jsonb_populate_record(null::public.customers,v_input) r;

    when 'products' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','category_id','supplier_id','name','sku','barcode','type','purchase_price','sale_price','stock_quantity','minimum_stock','default_warranty','service_type','service_pricing_mode','default_commission_amount','default_commission_percent','requires_account_number','requires_provider','requires_reference','notes','is_active','created_at','updated_at','allow_sell_at_loss','sell_at_loss_reason','sell_at_loss_updated_at','sell_at_loss_updated_by','image_path'])) then
        raise exception 'Unsupported columns for products.' using errcode='22023'; end if;
      v_input := jsonb_build_object('type','product'::public.product_type,'purchase_price',0,'sale_price',0,'stock_quantity',0,'minimum_stock',5,'default_warranty','None'::text,'default_commission_amount',0,'default_commission_percent',0,'requires_account_number',false,'requires_provider',false,'requires_reference',false,'is_active',true,'created_at',p_time,'updated_at',p_time,'allow_sell_at_loss',false,'sell_at_loss_reason',''::text) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.name is null or r.type is null or r.purchase_price is null or r.sale_price is null or r.stock_quantity is null or r.minimum_stock is null or r.default_warranty is null or r.default_commission_amount is null or r.default_commission_percent is null or r.requires_account_number is null or r.requires_provider is null or r.requires_reference is null or r.is_active is null or r.created_at is null or r.updated_at is null or r.allow_sell_at_loss is null or r.sell_at_loss_reason is null or (((default_commission_amount >= (0)::numeric))) is false or (((default_commission_percent >= (0)::numeric))) is false or (((minimum_stock >= 0))) is false or (((purchase_price >= (0)::numeric))) is false or (((sale_price >= (0)::numeric))) is false or (((stock_quantity >= 0))) is false or ((v_input->>'purchase_price')::numeric is distinct from r.purchase_price and v_input ? 'purchase_price') or ((v_input->>'sale_price')::numeric is distinct from r.sale_price and v_input ? 'sale_price') or ((v_input->>'default_commission_amount')::numeric is distinct from r.default_commission_amount and v_input ? 'default_commission_amount') or ((v_input->>'default_commission_percent')::numeric is distinct from r.default_commission_percent and v_input ? 'default_commission_percent'))
        into v_result,v_bad from jsonb_populate_record(null::public.products,v_input) r;

    when 'invoices' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','customer_id','invoice_no','status','subtotal','discount_total','customer_credit_applied','grand_total','amount_paid','balance_due','note','created_by','invoice_date','created_at','updated_at','amount_tendered','change_due','checkout_idempotency_key'])) then
        raise exception 'Unsupported columns for invoices.' using errcode='22023'; end if;
      v_input := jsonb_build_object('status','draft'::public.invoice_status,'subtotal',0,'discount_total',0,'customer_credit_applied',0,'grand_total',0,'amount_paid',0,'balance_due',0,'invoice_date',p_time,'created_at',p_time,'updated_at',p_time,'amount_tendered',0,'change_due',0) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.branch_id is null or r.invoice_no is null or r.status is null or r.subtotal is null or r.discount_total is null or r.customer_credit_applied is null or r.grand_total is null or r.amount_paid is null or r.balance_due is null or r.invoice_date is null or r.created_at is null or r.updated_at is null or r.amount_tendered is null or r.change_due is null or (((amount_tendered >= (0)::numeric))) is false or (((change_due >= (0)::numeric))) is false or ((v_input->>'subtotal')::numeric is distinct from r.subtotal and v_input ? 'subtotal') or ((v_input->>'discount_total')::numeric is distinct from r.discount_total and v_input ? 'discount_total') or ((v_input->>'customer_credit_applied')::numeric is distinct from r.customer_credit_applied and v_input ? 'customer_credit_applied') or ((v_input->>'grand_total')::numeric is distinct from r.grand_total and v_input ? 'grand_total') or ((v_input->>'amount_paid')::numeric is distinct from r.amount_paid and v_input ? 'amount_paid') or ((v_input->>'balance_due')::numeric is distinct from r.balance_due and v_input ? 'balance_due') or ((v_input->>'amount_tendered')::numeric is distinct from r.amount_tendered and v_input ? 'amount_tendered') or ((v_input->>'change_due')::numeric is distinct from r.change_due and v_input ? 'change_due'))
        into v_result,v_bad from jsonb_populate_record(null::public.invoices,v_input) r;

    when 'credit_payments' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','customer_id','amount','method','reference_number','notes','received_by','created_at','updated_at'])) then
        raise exception 'Unsupported columns for credit_payments.' using errcode='22023'; end if;
      v_input := jsonb_build_object('created_at',p_time,'updated_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.customer_id is null or r.amount is null or r.method is null or r.created_at is null or r.updated_at is null or (((amount > (0)::numeric))) is false or ((v_input->>'amount')::numeric is distinct from r.amount and v_input ? 'amount'))
        into v_result,v_bad from jsonb_populate_record(null::public.credit_payments,v_input) r;

    when 'customer_write_offs' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','customer_id','amount','reason','written_by','created_at','updated_at'])) then
        raise exception 'Unsupported columns for customer_write_offs.' using errcode='22023'; end if;
      v_input := jsonb_build_object('created_at',p_time,'updated_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.customer_id is null or r.amount is null or r.reason is null or r.created_at is null or r.updated_at is null or (((amount > (0)::numeric))) is false or ((v_input->>'amount')::numeric is distinct from r.amount and v_input ? 'amount'))
        into v_result,v_bad from jsonb_populate_record(null::public.customer_write_offs,v_input) r;

    when 'supplier_purchases' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','supplier_id','purchase_no','status','purchase_date','subtotal','discount_total','grand_total','amount_paid','balance_due','reference_no','notes','created_by','created_at','updated_at'])) then
        raise exception 'Unsupported columns for supplier_purchases.' using errcode='22023'; end if;
      v_input := jsonb_build_object('status','unpaid'::text,'purchase_date',p_time::date,'subtotal',0,'discount_total',0,'grand_total',0,'amount_paid',0,'balance_due',0,'created_at',p_time,'updated_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.branch_id is null or r.supplier_id is null or r.purchase_no is null or r.status is null or r.purchase_date is null or r.subtotal is null or r.discount_total is null or r.grand_total is null or r.amount_paid is null or r.balance_due is null or r.created_at is null or r.updated_at is null or (((amount_paid >= (0)::numeric))) is false or (((balance_due >= (0)::numeric))) is false or (((discount_total >= (0)::numeric))) is false or (((grand_total >= (0)::numeric))) is false or (((status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text])))) is false or (((subtotal >= (0)::numeric))) is false or ((v_input->>'subtotal')::numeric is distinct from r.subtotal and v_input ? 'subtotal') or ((v_input->>'discount_total')::numeric is distinct from r.discount_total and v_input ? 'discount_total') or ((v_input->>'grand_total')::numeric is distinct from r.grand_total and v_input ? 'grand_total') or ((v_input->>'amount_paid')::numeric is distinct from r.amount_paid and v_input ? 'amount_paid') or ((v_input->>'balance_due')::numeric is distinct from r.balance_due and v_input ? 'balance_due'))
        into v_result,v_bad from jsonb_populate_record(null::public.supplier_purchases,v_input) r;

    when 'supplier_write_offs' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','supplier_id','amount','reason','written_by','created_at','updated_at'])) then
        raise exception 'Unsupported columns for supplier_write_offs.' using errcode='22023'; end if;
      v_input := jsonb_build_object('created_at',p_time,'updated_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.supplier_id is null or r.amount is null or r.reason is null or r.created_at is null or r.updated_at is null or (((amount > (0)::numeric))) is false or ((v_input->>'amount')::numeric is distinct from r.amount and v_input ? 'amount'))
        into v_result,v_bad from jsonb_populate_record(null::public.supplier_write_offs,v_input) r;

    when 'product_stock_lots' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','product_id','supplier_id','lot_number','purchase_date','quantity_received','quantity_remaining','unit_cost','notes','is_active','created_by','created_at','updated_at'])) then
        raise exception 'Unsupported columns for product_stock_lots.' using errcode='22023'; end if;
      v_input := jsonb_build_object('purchase_date',p_time::date,'is_active',true,'created_at',p_time,'updated_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.branch_id is null or r.product_id is null or r.purchase_date is null or r.quantity_received is null or r.quantity_remaining is null or r.unit_cost is null or r.is_active is null or r.created_at is null or r.updated_at is null or (((quantity_received >= 0))) is false or (((quantity_remaining >= 0))) is false or (((unit_cost >= (0)::numeric))) is false or ((v_input->>'unit_cost')::numeric is distinct from r.unit_cost and v_input ? 'unit_cost'))
        into v_result,v_bad from jsonb_populate_record(null::public.product_stock_lots,v_input) r;

    when 'invoice_items' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','invoice_id','product_id','product_name','product_type','quantity','purchase_price','unit_price','item_discount','line_total','service_provider','service_direction','service_account_number','service_receiver_account','service_reference_no','service_transaction_amount','service_commission','service_total_charged','service_note','created_at','updated_at','allow_sell_at_loss_snapshot','loss_override_reason_snapshot','effective_unit_price_snapshot','loss_amount_snapshot'])) then
        raise exception 'Unsupported columns for invoice_items.' using errcode='22023'; end if;
      v_input := jsonb_build_object('product_type','product'::public.product_type,'quantity',1,'purchase_price',0,'unit_price',0,'item_discount',0,'line_total',0,'service_transaction_amount',0,'service_commission',0,'service_total_charged',0,'created_at',p_time,'updated_at',p_time,'allow_sell_at_loss_snapshot',false,'loss_override_reason_snapshot',''::text) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.invoice_id is null or r.product_name is null or r.product_type is null or r.quantity is null or r.purchase_price is null or r.unit_price is null or r.item_discount is null or r.line_total is null or r.service_transaction_amount is null or r.service_commission is null or r.service_total_charged is null or r.created_at is null or r.updated_at is null or r.allow_sell_at_loss_snapshot is null or r.loss_override_reason_snapshot is null or (((quantity > 0))) is false or ((v_input->>'purchase_price')::numeric is distinct from r.purchase_price and v_input ? 'purchase_price') or ((v_input->>'unit_price')::numeric is distinct from r.unit_price and v_input ? 'unit_price') or ((v_input->>'item_discount')::numeric is distinct from r.item_discount and v_input ? 'item_discount') or ((v_input->>'line_total')::numeric is distinct from r.line_total and v_input ? 'line_total') or ((v_input->>'service_transaction_amount')::numeric is distinct from r.service_transaction_amount and v_input ? 'service_transaction_amount') or ((v_input->>'service_commission')::numeric is distinct from r.service_commission and v_input ? 'service_commission') or ((v_input->>'service_total_charged')::numeric is distinct from r.service_total_charged and v_input ? 'service_total_charged') or ((v_input->>'effective_unit_price_snapshot')::numeric is distinct from r.effective_unit_price_snapshot and v_input ? 'effective_unit_price_snapshot') or ((v_input->>'loss_amount_snapshot')::numeric is distinct from r.loss_amount_snapshot and v_input ? 'loss_amount_snapshot'))
        into v_result,v_bad from jsonb_populate_record(null::public.invoice_items,v_input) r;

    when 'payments' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','invoice_id','customer_id','method','amount','reference_no','note','received_by','paid_at','created_at','updated_at'])) then
        raise exception 'Unsupported columns for payments.' using errcode='22023'; end if;
      v_input := jsonb_build_object('method','cash'::public.payment_method,'paid_at',p_time,'created_at',p_time,'updated_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.branch_id is null or r.method is null or r.amount is null or r.paid_at is null or r.created_at is null or r.updated_at is null or (((amount >= (0)::numeric))) is false or ((v_input->>'amount')::numeric is distinct from r.amount and v_input ? 'amount'))
        into v_result,v_bad from jsonb_populate_record(null::public.payments,v_input) r;

    when 'returns' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','invoice_id','customer_id','return_no','status','subtotal','refund_amount','refund_method','reference_number','notes','created_by','created_at','updated_at','return_math_version','debt_relief','restored_cost','idempotency_key','request_payload'])) then
        raise exception 'Unsupported columns for returns.' using errcode='22023'; end if;
      v_input := jsonb_build_object('status','completed'::text,'subtotal',0,'refund_amount',0,'created_at',p_time,'updated_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.branch_id is null or r.invoice_id is null or r.return_no is null or r.status is null or r.subtotal is null or r.refund_amount is null or r.created_at is null or r.updated_at is null or (((refund_amount >= (0)::numeric))) is false or ((((refund_method IS NULL) OR (refund_method = ANY (ARRAY['cash'::text, 'card'::text, 'easypaisa'::text, 'jazzcash'::text, 'bank_transfer'::text]))))) is false or (((status = ANY (ARRAY['completed'::text, 'cancelled'::text])))) is false or (((subtotal >= (0)::numeric))) is false or ((v_input->>'subtotal')::numeric is distinct from r.subtotal and v_input ? 'subtotal') or ((v_input->>'refund_amount')::numeric is distinct from r.refund_amount and v_input ? 'refund_amount'))
        into v_result,v_bad from jsonb_populate_record(null::public.returns,v_input) r;
      v_bad := v_bad
        or (v_input->>'debt_relief')::numeric is distinct from (v_result->>'debt_relief')::numeric
        or (v_input->>'restored_cost')::numeric is distinct from (v_result->>'restored_cost')::numeric
        or coalesce((v_result->>'debt_relief')::numeric < 0, false)
        or coalesce((v_result->>'restored_cost')::numeric < 0, false);
      if v_result->>'return_math_version' is not null then
        v_bad := v_bad or v_result->>'return_math_version' <> '1'
          or v_result->>'status' <> 'completed' or v_result->>'debt_relief' is null
          or v_result->>'restored_cost' is null or v_result->>'idempotency_key' is null
          or jsonb_typeof(v_result->'request_payload') is distinct from 'object'
          or (v_result->>'subtotal')::numeric <> (v_result->>'debt_relief')::numeric + (v_result->>'refund_amount')::numeric;
      end if;

    when 'supplier_payments' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','supplier_id','purchase_id','method','amount','reference_no','note','paid_at','created_by','created_at','updated_at'])) then
        raise exception 'Unsupported columns for supplier_payments.' using errcode='22023'; end if;
      v_input := jsonb_build_object('paid_at',p_time,'created_at',p_time,'updated_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.branch_id is null or r.supplier_id is null or r.method is null or r.amount is null or r.paid_at is null or r.created_at is null or r.updated_at is null or (((amount > (0)::numeric))) is false or ((v_input->>'amount')::numeric is distinct from r.amount and v_input ? 'amount'))
        into v_result,v_bad from jsonb_populate_record(null::public.supplier_payments,v_input) r;

    when 'customer_ledger_entries' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','customer_id','invoice_id','payment_id','credit_payment_id','entry_type','direction','amount','balance_after','description','reference_number','created_by','created_at','updated_at'])) then
        raise exception 'Unsupported columns for customer_ledger_entries.' using errcode='22023'; end if;
      v_input := jsonb_build_object('created_at',p_time,'updated_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.customer_id is null or r.entry_type is null or r.direction is null or r.amount is null or r.balance_after is null or r.created_at is null or r.updated_at is null or (((amount >= (0)::numeric))) is false or ((v_input->>'amount')::numeric is distinct from r.amount and v_input ? 'amount') or ((v_input->>'balance_after')::numeric is distinct from r.balance_after and v_input ? 'balance_after'))
        into v_result,v_bad from jsonb_populate_record(null::public.customer_ledger_entries,v_input) r;

    when 'supplier_ledger_entries' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','supplier_id','purchase_id','payment_id','entry_type','direction','amount','balance_after','description','reference_number','created_by','created_at','updated_at'])) then
        raise exception 'Unsupported columns for supplier_ledger_entries.' using errcode='22023'; end if;
      v_input := jsonb_build_object('created_at',p_time,'updated_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.supplier_id is null or r.entry_type is null or r.direction is null or r.amount is null or r.balance_after is null or r.created_at is null or r.updated_at is null or (((amount >= (0)::numeric))) is false or (((direction = ANY (ARRAY['credit'::text, 'debit'::text])))) is false or (((entry_type = ANY (ARRAY['purchase_credit'::text, 'payment_debit'::text, 'adjustment'::text])))) is false or ((v_input->>'amount')::numeric is distinct from r.amount and v_input ? 'amount') or ((v_input->>'balance_after')::numeric is distinct from r.balance_after and v_input ? 'balance_after'))
        into v_result,v_bad from jsonb_populate_record(null::public.supplier_ledger_entries,v_input) r;

    when 'invoice_item_stock_allocations' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','invoice_id','invoice_item_id','product_id','stock_lot_id','quantity','unit_cost','created_at'])) then
        raise exception 'Unsupported columns for invoice_item_stock_allocations.' using errcode='22023'; end if;
      v_input := jsonb_build_object('created_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.invoice_id is null or r.invoice_item_id is null or r.product_id is null or r.stock_lot_id is null or r.quantity is null or r.unit_cost is null or r.created_at is null or (((quantity > 0))) is false or (((unit_cost >= (0)::numeric))) is false or ((v_input->>'unit_cost')::numeric is distinct from r.unit_cost and v_input ? 'unit_cost'))
        into v_result,v_bad from jsonb_populate_record(null::public.invoice_item_stock_allocations,v_input) r;

    when 'stock_movements' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','product_id','stock_lot_id','movement_type','quantity','unit_cost','reference_type','reference_id','invoice_id','invoice_item_id','notes','created_by','created_at'])) then
        raise exception 'Unsupported columns for stock_movements.' using errcode='22023'; end if;
      v_input := jsonb_build_object('created_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.branch_id is null or r.product_id is null or r.movement_type is null or r.quantity is null or r.created_at is null or (((movement_type = ANY (ARRAY['purchase'::text, 'sale'::text, 'return_in'::text, 'return_out'::text, 'adjustment_in'::text, 'adjustment_out'::text, 'opening_stock'::text, 'void'::text])))) is false or (((quantity > 0))) is false or (((unit_cost >= (0)::numeric))) is false or ((v_input->>'unit_cost')::numeric is distinct from r.unit_cost and v_input ? 'unit_cost'))
        into v_result,v_bad from jsonb_populate_record(null::public.stock_movements,v_input) r;

    when 'supplier_purchase_items' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','purchase_id','product_id','product_name','quantity','unit_cost','line_total','stock_lot_id','notes','created_at'])) then
        raise exception 'Unsupported columns for supplier_purchase_items.' using errcode='22023'; end if;
      v_input := jsonb_build_object('created_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.purchase_id is null or r.product_id is null or r.product_name is null or r.quantity is null or r.unit_cost is null or r.line_total is null or r.created_at is null or (((line_total >= (0)::numeric))) is false or (((quantity > 0))) is false or (((unit_cost >= (0)::numeric))) is false or ((v_input->>'unit_cost')::numeric is distinct from r.unit_cost and v_input ? 'unit_cost') or ((v_input->>'line_total')::numeric is distinct from r.line_total and v_input ? 'line_total'))
        into v_result,v_bad from jsonb_populate_record(null::public.supplier_purchase_items,v_input) r;

    when 'return_items' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','return_id','invoice_id','invoice_item_id','product_id','item_name','item_type','quantity','unit_price','line_total','restock','created_at','restock_quantity'])) then
        raise exception 'Unsupported columns for return_items.' using errcode='22023'; end if;
      v_input := jsonb_build_object('restock',true,'created_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.return_id is null or r.invoice_id is null or r.invoice_item_id is null or r.item_name is null or r.item_type is null or r.quantity is null or r.unit_price is null or r.line_total is null or r.restock is null or r.created_at is null or (((item_type = ANY (ARRAY['product'::text, 'service'::text])))) is false or (((line_total >= (0)::numeric))) is false or (((quantity > 0))) is false or (((unit_price >= (0)::numeric))) is false or ((v_input->>'unit_price')::numeric is distinct from r.unit_price and v_input ? 'unit_price') or ((v_input->>'line_total')::numeric is distinct from r.line_total and v_input ? 'line_total'))
        into v_result,v_bad from jsonb_populate_record(null::public.return_items,v_input) r;
      if v_result->>'restock_quantity' is not null then
        v_bad := v_bad or (v_result->>'restock_quantity')::integer < 0
          or (v_result->>'restock_quantity')::integer > (v_result->>'quantity')::integer
          or (v_result->>'item_type' = 'service' and (v_result->>'restock_quantity')::integer <> 0);
      end if;

    when 'return_stock_allocations' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','return_id','return_item_id','product_id','stock_lot_id','quantity','unit_cost','created_at'])) then
        raise exception 'Unsupported columns for return_stock_allocations.' using errcode='22023'; end if;
      v_input := jsonb_build_object('created_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.return_id is null or r.return_item_id is null or r.product_id is null or r.stock_lot_id is null or r.quantity is null or r.unit_cost is null or r.created_at is null or (((quantity > 0))) is false or (((unit_cost >= (0)::numeric))) is false or ((v_input->>'unit_cost')::numeric is distinct from r.unit_cost and v_input ? 'unit_cost'))
        into v_result,v_bad from jsonb_populate_record(null::public.return_stock_allocations,v_input) r;

    when 'cash_shifts' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','opened_at','closed_at','opened_by','closed_by','starting_cash','expected_cash','counted_cash','cash_difference','notes','status','created_at','updated_at'])) then
        raise exception 'Unsupported columns for cash_shifts.' using errcode='22023'; end if;
      v_input := jsonb_build_object('opened_at',p_time,'starting_cash',0,'expected_cash',0,'status','open'::text,'created_at',p_time,'updated_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.branch_id is null or r.opened_at is null or r.opened_by is null or r.starting_cash is null or r.expected_cash is null or r.status is null or r.created_at is null or r.updated_at is null or (((status = ANY (ARRAY['open'::text, 'closed'::text])))) is false or ((v_input->>'starting_cash')::numeric is distinct from r.starting_cash and v_input ? 'starting_cash') or ((v_input->>'expected_cash')::numeric is distinct from r.expected_cash and v_input ? 'expected_cash') or ((v_input->>'counted_cash')::numeric is distinct from r.counted_cash and v_input ? 'counted_cash') or ((v_input->>'cash_difference')::numeric is distinct from r.cash_difference and v_input ? 'cash_difference'))
        into v_result,v_bad from jsonb_populate_record(null::public.cash_shifts,v_input) r;

    when 'expenses' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','category','amount','payment_method','vendor_name','notes','status','spent_at','created_by','archived_at','archived_by','created_at','updated_at'])) then
        raise exception 'Unsupported columns for expenses.' using errcode='22023'; end if;
      v_input := jsonb_build_object('category','Miscellaneous'::text,'payment_method','cash'::public.payment_method,'status','active'::public.expense_status,'spent_at',p_time,'created_at',p_time,'updated_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.branch_id is null or r.category is null or r.amount is null or r.payment_method is null or r.status is null or r.spent_at is null or r.created_at is null or r.updated_at is null or (((amount >= (0)::numeric))) is false or ((v_input->>'amount')::numeric is distinct from r.amount and v_input ? 'amount'))
        into v_result,v_bad from jsonb_populate_record(null::public.expenses,v_input) r;

    when 'repairs' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','customer_id','job_no','customer_name','customer_phone','device_type','device_model','serial_imei','problem_description','diagnosis','estimated_cost','advance_paid','final_cost','status','expected_delivery_at','delivered_at','notes','created_by','created_at','updated_at','accessories_received','payment_method'])) then
        raise exception 'Unsupported columns for repairs.' using errcode='22023'; end if;
      v_input := jsonb_build_object('device_type','Other'::text,'estimated_cost',0,'advance_paid',0,'final_cost',0,'status','received'::public.repair_status,'created_at',p_time,'updated_at',p_time,'payment_method','cash'::public.payment_method) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.branch_id is null or r.job_no is null or r.customer_name is null or r.device_type is null or r.problem_description is null or r.estimated_cost is null or r.advance_paid is null or r.final_cost is null or r.status is null or r.created_at is null or r.updated_at is null or r.payment_method is null or ((v_input->>'estimated_cost')::numeric is distinct from r.estimated_cost and v_input ? 'estimated_cost') or ((v_input->>'advance_paid')::numeric is distinct from r.advance_paid and v_input ? 'advance_paid') or ((v_input->>'final_cost')::numeric is distinct from r.final_cost and v_input ? 'final_cost'))
        into v_result,v_bad from jsonb_populate_record(null::public.repairs,v_input) r;

    when 'daily_closings' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','closing_date','bills_count','cash_sales','digital_payments','credit_pending','expenses_total','refunds_total','service_commission_earned','service_cash_in','service_cash_out','expected_closing_cash','actual_closing_cash','cash_difference','notes','finalized_by','created_at','updated_at','finalized_at','credit_collection_cash','credit_collection_digital','credit_write_offs'])) then
        raise exception 'Unsupported columns for daily_closings.' using errcode='22023'; end if;
      v_input := jsonb_build_object('bills_count',0,'cash_sales',0,'digital_payments',0,'credit_pending',0,'expenses_total',0,'refunds_total',0,'service_commission_earned',0,'service_cash_in',0,'service_cash_out',0,'expected_closing_cash',0,'actual_closing_cash',0,'cash_difference',0,'created_at',p_time,'updated_at',p_time,'credit_collection_cash',0,'credit_collection_digital',0,'credit_write_offs',0) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.branch_id is null or r.closing_date is null or r.bills_count is null or r.cash_sales is null or r.digital_payments is null or r.credit_pending is null or r.expenses_total is null or r.refunds_total is null or r.service_commission_earned is null or r.service_cash_in is null or r.service_cash_out is null or r.expected_closing_cash is null or r.actual_closing_cash is null or r.cash_difference is null or r.created_at is null or r.updated_at is null or r.credit_collection_cash is null or r.credit_collection_digital is null or r.credit_write_offs is null or ((v_input->>'cash_sales')::numeric is distinct from r.cash_sales and v_input ? 'cash_sales') or ((v_input->>'digital_payments')::numeric is distinct from r.digital_payments and v_input ? 'digital_payments') or ((v_input->>'credit_pending')::numeric is distinct from r.credit_pending and v_input ? 'credit_pending') or ((v_input->>'expenses_total')::numeric is distinct from r.expenses_total and v_input ? 'expenses_total') or ((v_input->>'refunds_total')::numeric is distinct from r.refunds_total and v_input ? 'refunds_total') or ((v_input->>'service_commission_earned')::numeric is distinct from r.service_commission_earned and v_input ? 'service_commission_earned') or ((v_input->>'service_cash_in')::numeric is distinct from r.service_cash_in and v_input ? 'service_cash_in') or ((v_input->>'service_cash_out')::numeric is distinct from r.service_cash_out and v_input ? 'service_cash_out') or ((v_input->>'expected_closing_cash')::numeric is distinct from r.expected_closing_cash and v_input ? 'expected_closing_cash') or ((v_input->>'actual_closing_cash')::numeric is distinct from r.actual_closing_cash and v_input ? 'actual_closing_cash') or ((v_input->>'cash_difference')::numeric is distinct from r.cash_difference and v_input ? 'cash_difference') or ((v_input->>'credit_collection_cash')::numeric is distinct from r.credit_collection_cash and v_input ? 'credit_collection_cash') or ((v_input->>'credit_collection_digital')::numeric is distinct from r.credit_collection_digital and v_input ? 'credit_collection_digital') or ((v_input->>'credit_write_offs')::numeric is distinct from r.credit_write_offs and v_input ? 'credit_write_offs'))
        into v_result,v_bad from jsonb_populate_record(null::public.daily_closings,v_input) r;

    when 'staff_permissions' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','profile_id','can_sell','can_discount','can_return','can_void_invoice','can_view_reports','can_manage_stock','can_sell_at_loss','can_change_settings','created_at','updated_at'])) then
        raise exception 'Unsupported columns for staff_permissions.' using errcode='22023'; end if;
      v_input := jsonb_build_object('created_at',p_time,'updated_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.profile_id is null or r.created_at is null or r.updated_at is null)
        into v_result,v_bad from jsonb_populate_record(null::public.staff_permissions,v_input) r;

    when 'loss_prevention_events' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','product_id','invoice_id','actor_id','event_type','reason','cost_amount','effective_sale_amount','loss_amount','metadata','created_at'])) then
        raise exception 'Unsupported columns for loss_prevention_events.' using errcode='22023'; end if;
      v_input := jsonb_build_object('metadata','{}'::jsonb,'created_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.event_type is null or r.metadata is null or r.created_at is null or (((event_type = ANY (ARRAY['override_enabled'::text, 'override_disabled'::text, 'override_reason_changed'::text, 'loss_sale_completed'::text])))) is false or ((v_input->>'cost_amount')::numeric is distinct from r.cost_amount and v_input ? 'cost_amount') or ((v_input->>'effective_sale_amount')::numeric is distinct from r.effective_sale_amount and v_input ? 'effective_sale_amount') or ((v_input->>'loss_amount')::numeric is distinct from r.loss_amount and v_input ? 'loss_amount'))
        into v_result,v_bad from jsonb_populate_record(null::public.loss_prevention_events,v_input) r;

    when 'audit_logs' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','actor_id','module','action','details','metadata','created_at'])) then
        raise exception 'Unsupported columns for audit_logs.' using errcode='22023'; end if;
      v_input := jsonb_build_object('metadata','{}'::jsonb,'created_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.module is null or r.action is null or r.metadata is null or r.created_at is null)
        into v_result,v_bad from jsonb_populate_record(null::public.audit_logs,v_input) r;

    when 'invoice_payment_allocations' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','customer_id','invoice_id','credit_payment_id','allocation_kind','amount','created_at'])) then
        raise exception 'Unsupported columns for invoice_payment_allocations.' using errcode='22023'; end if;
      v_input := jsonb_build_object('allocation_kind','actual_payment','created_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.customer_id is null or r.invoice_id is null or r.credit_payment_id is null or r.allocation_kind is null or r.amount is null or r.created_at is null or r.allocation_kind <> 'actual_payment' or r.amount <= 0 or ((v_input->>'amount')::numeric is distinct from r.amount))
        into v_result,v_bad from jsonb_populate_record(null::public.invoice_payment_allocations,v_input) r;

    when 'return_item_source_allocations' then
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','return_id','return_item_id','invoice_item_id','product_id','sale_allocation_id','stock_lot_id','quantity','restock_quantity','unit_cost','created_at'])) then
        raise exception 'Unsupported columns for return_item_source_allocations.' using errcode='22023'; end if;
      v_input := jsonb_build_object('created_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.return_id is null or r.return_item_id is null or r.invoice_item_id is null or r.product_id is null or r.sale_allocation_id is null or r.stock_lot_id is null or r.quantity is null or r.restock_quantity is null or r.unit_cost is null or r.created_at is null or r.quantity <= 0 or r.restock_quantity < 0 or r.restock_quantity > r.quantity or r.unit_cost < 0 or ((v_input->>'unit_cost')::numeric is distinct from r.unit_cost))
        into v_result,v_bad from jsonb_populate_record(null::public.return_item_source_allocations,v_input) r;

    else raise exception 'Unsupported accounting relation.' using errcode='22023';
  end case;
  if v_bad then raise exception 'A staged row violates required values or exact numeric precision.' using errcode='22023'; end if;
  for v_field in select key,value from jsonb_each_text(v_result) loop
    if v_field.key=any(array['amount','balance_after','credit_limit','outstanding_balance','unit_cost',
      'purchase_price','unit_price','item_discount','line_total','service_transaction_amount','service_commission',
      'service_total_charged','effective_unit_price_snapshot','loss_amount_snapshot','subtotal','discount_total',
      'customer_credit_applied','grand_total','amount_paid','balance_due','amount_tendered','change_due','cost_amount',
      'effective_sale_amount','loss_amount','sale_price','default_commission_amount','default_commission_percent','refund_amount','debt_relief','restored_cost'])
      and v_field.value is not null and v_field.value !~ '^-?[0-9]+([.][0-9]+)?$' then
      raise exception 'A staged monetary value must be finite numeric data.' using errcode='22023';
    end if;
  end loop;
  -- Live row types now contain local-only provenance. Do not enlarge the sealed
  -- canonical business snapshot with even NULL source trust fields.
  return v_result - 'posting_sequence' - 'posting_trust_version' - 'posting_effective_at'
    - 'source_trust_version' - 'source_effective_at' - 'source_transaction_id';
end; $$;

CREATE OR REPLACE FUNCTION backup_private.insert_snapshot(p_job uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
begin

  insert into public.product_categories(id,organization_id,name,is_active,created_at,updated_at,description)
    select r.id,r.organization_id,r.name,r.is_active,r.created_at,r.updated_at,r.description from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.product_categories,s.payload) r
    where s.job_id=p_job and s.table_name='product_categories' order by s.target_id;

  insert into public.suppliers(id,organization_id,name,company,phone,email,address,notes,is_active,created_at,updated_at,outstanding_balance)
    select r.id,r.organization_id,r.name,r.company,r.phone,r.email,r.address,r.notes,r.is_active,r.created_at,r.updated_at,r.outstanding_balance from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.suppliers,s.payload) r
    where s.job_id=p_job and s.table_name='suppliers' order by s.target_id;

  insert into public.customers(id,organization_id,branch_id,name,phone,email,address,notes,credit_limit,is_archived,archived_at,created_at,updated_at,outstanding_balance)
    select r.id,r.organization_id,r.branch_id,r.name,r.phone,r.email,r.address,r.notes,r.credit_limit,r.is_archived,r.archived_at,r.created_at,r.updated_at,r.outstanding_balance from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.customers,s.payload) r
    where s.job_id=p_job and s.table_name='customers' order by s.target_id;

  insert into public.products(id,organization_id,branch_id,category_id,supplier_id,name,sku,barcode,type,purchase_price,sale_price,stock_quantity,minimum_stock,default_warranty,service_type,service_pricing_mode,default_commission_amount,default_commission_percent,requires_account_number,requires_provider,requires_reference,notes,is_active,created_at,updated_at,allow_sell_at_loss,sell_at_loss_reason,sell_at_loss_updated_at,sell_at_loss_updated_by,image_path)
    select r.id,r.organization_id,r.branch_id,r.category_id,r.supplier_id,r.name,r.sku,r.barcode,r.type,r.purchase_price,r.sale_price,r.stock_quantity,r.minimum_stock,r.default_warranty,r.service_type,r.service_pricing_mode,r.default_commission_amount,r.default_commission_percent,r.requires_account_number,r.requires_provider,r.requires_reference,r.notes,r.is_active,r.created_at,r.updated_at,r.allow_sell_at_loss,r.sell_at_loss_reason,r.sell_at_loss_updated_at,r.sell_at_loss_updated_by,r.image_path from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.products,s.payload) r
    where s.job_id=p_job and s.table_name='products' order by s.target_id;

  insert into public.invoices(id,organization_id,branch_id,customer_id,invoice_no,status,subtotal,discount_total,customer_credit_applied,grand_total,amount_paid,balance_due,note,created_by,invoice_date,created_at,updated_at,amount_tendered,change_due,checkout_idempotency_key)
    select r.id,r.organization_id,r.branch_id,r.customer_id,r.invoice_no,r.status,r.subtotal,r.discount_total,r.customer_credit_applied,r.grand_total,r.amount_paid,r.balance_due,r.note,r.created_by,r.invoice_date,r.created_at,r.updated_at,r.amount_tendered,r.change_due,r.checkout_idempotency_key from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.invoices,s.payload) r
    where s.job_id=p_job and s.table_name='invoices' order by s.target_id;

  insert into public.credit_payments(id,organization_id,branch_id,customer_id,amount,method,reference_number,notes,received_by,created_at,updated_at)
    select r.id,r.organization_id,r.branch_id,r.customer_id,r.amount,r.method,r.reference_number,r.notes,r.received_by,r.created_at,r.updated_at from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.credit_payments,s.payload) r
    where s.job_id=p_job and s.table_name='credit_payments' order by s.target_id;

  insert into public.customer_write_offs(id,organization_id,branch_id,customer_id,amount,reason,written_by,created_at,updated_at)
    select r.id,r.organization_id,r.branch_id,r.customer_id,r.amount,r.reason,r.written_by,r.created_at,r.updated_at from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.customer_write_offs,s.payload) r
    where s.job_id=p_job and s.table_name='customer_write_offs' order by s.target_id;

  insert into public.supplier_purchases(id,organization_id,branch_id,supplier_id,purchase_no,status,purchase_date,subtotal,discount_total,grand_total,amount_paid,balance_due,reference_no,notes,created_by,created_at,updated_at)
    select r.id,r.organization_id,r.branch_id,r.supplier_id,r.purchase_no,r.status,r.purchase_date,r.subtotal,r.discount_total,r.grand_total,r.amount_paid,r.balance_due,r.reference_no,r.notes,r.created_by,r.created_at,r.updated_at from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.supplier_purchases,s.payload) r
    where s.job_id=p_job and s.table_name='supplier_purchases' order by s.target_id;

  insert into public.supplier_write_offs(id,organization_id,branch_id,supplier_id,amount,reason,written_by,created_at,updated_at)
    select r.id,r.organization_id,r.branch_id,r.supplier_id,r.amount,r.reason,r.written_by,r.created_at,r.updated_at from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.supplier_write_offs,s.payload) r
    where s.job_id=p_job and s.table_name='supplier_write_offs' order by s.target_id;

  insert into public.product_stock_lots(id,organization_id,branch_id,product_id,supplier_id,lot_number,purchase_date,quantity_received,quantity_remaining,unit_cost,notes,is_active,created_by,created_at,updated_at)
    select r.id,r.organization_id,r.branch_id,r.product_id,r.supplier_id,r.lot_number,r.purchase_date,r.quantity_received,r.quantity_remaining,r.unit_cost,r.notes,r.is_active,r.created_by,r.created_at,r.updated_at from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.product_stock_lots,s.payload) r
    where s.job_id=p_job and s.table_name='product_stock_lots' order by s.target_id;

  insert into public.invoice_items(id,organization_id,invoice_id,product_id,product_name,product_type,quantity,purchase_price,unit_price,item_discount,line_total,service_provider,service_direction,service_account_number,service_receiver_account,service_reference_no,service_transaction_amount,service_commission,service_total_charged,service_note,created_at,updated_at,allow_sell_at_loss_snapshot,loss_override_reason_snapshot,effective_unit_price_snapshot,loss_amount_snapshot)
    select r.id,r.organization_id,r.invoice_id,r.product_id,r.product_name,r.product_type,r.quantity,r.purchase_price,r.unit_price,r.item_discount,r.line_total,r.service_provider,r.service_direction,r.service_account_number,r.service_receiver_account,r.service_reference_no,r.service_transaction_amount,r.service_commission,r.service_total_charged,r.service_note,r.created_at,r.updated_at,r.allow_sell_at_loss_snapshot,r.loss_override_reason_snapshot,r.effective_unit_price_snapshot,r.loss_amount_snapshot from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.invoice_items,s.payload) r
    where s.job_id=p_job and s.table_name='invoice_items' order by s.target_id;

  insert into public.payments(id,organization_id,branch_id,invoice_id,customer_id,method,amount,reference_no,note,received_by,paid_at,created_at,updated_at)
    select r.id,r.organization_id,r.branch_id,r.invoice_id,r.customer_id,r.method,r.amount,r.reference_no,r.note,r.received_by,r.paid_at,r.created_at,r.updated_at from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.payments,s.payload) r
    where s.job_id=p_job and s.table_name='payments' order by s.target_id;

  insert into public.returns(id,organization_id,branch_id,invoice_id,customer_id,return_no,status,subtotal,refund_amount,refund_method,reference_number,notes,created_by,created_at,updated_at,return_math_version,debt_relief,restored_cost,idempotency_key,request_payload)
    select r.id,r.organization_id,r.branch_id,r.invoice_id,r.customer_id,r.return_no,r.status,r.subtotal,r.refund_amount,r.refund_method,r.reference_number,r.notes,r.created_by,r.created_at,r.updated_at,r.return_math_version,r.debt_relief,r.restored_cost,r.idempotency_key,r.request_payload from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.returns,s.payload) r
    where s.job_id=p_job and s.table_name='returns' order by s.target_id;

  insert into public.supplier_payments(id,organization_id,branch_id,supplier_id,purchase_id,method,amount,reference_no,note,paid_at,created_by,created_at,updated_at)
    select r.id,r.organization_id,r.branch_id,r.supplier_id,r.purchase_id,r.method,r.amount,r.reference_no,r.note,r.paid_at,r.created_by,r.created_at,r.updated_at from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.supplier_payments,s.payload) r
    where s.job_id=p_job and s.table_name='supplier_payments' order by s.target_id;

  insert into public.customer_ledger_entries(id,organization_id,branch_id,customer_id,invoice_id,payment_id,credit_payment_id,entry_type,direction,amount,balance_after,description,reference_number,created_by,created_at,updated_at)
    select r.id,r.organization_id,r.branch_id,r.customer_id,r.invoice_id,r.payment_id,r.credit_payment_id,r.entry_type,r.direction,r.amount,r.balance_after,r.description,r.reference_number,r.created_by,r.created_at,r.updated_at from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.customer_ledger_entries,s.payload) r
    where s.job_id=p_job and s.table_name='customer_ledger_entries' order by s.target_id;

  insert into public.supplier_ledger_entries(id,organization_id,branch_id,supplier_id,purchase_id,payment_id,entry_type,direction,amount,balance_after,description,reference_number,created_by,created_at,updated_at)
    select r.id,r.organization_id,r.branch_id,r.supplier_id,r.purchase_id,r.payment_id,r.entry_type,r.direction,r.amount,r.balance_after,r.description,r.reference_number,r.created_by,r.created_at,r.updated_at from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.supplier_ledger_entries,s.payload) r
    where s.job_id=p_job and s.table_name='supplier_ledger_entries' order by s.target_id;

  insert into public.invoice_item_stock_allocations(id,organization_id,invoice_id,invoice_item_id,product_id,stock_lot_id,quantity,unit_cost,created_at)
    select r.id,r.organization_id,r.invoice_id,r.invoice_item_id,r.product_id,r.stock_lot_id,r.quantity,r.unit_cost,r.created_at from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.invoice_item_stock_allocations,s.payload) r
    where s.job_id=p_job and s.table_name='invoice_item_stock_allocations' order by s.target_id;

  insert into public.stock_movements(id,organization_id,branch_id,product_id,stock_lot_id,movement_type,quantity,unit_cost,reference_type,reference_id,invoice_id,invoice_item_id,notes,created_by,created_at)
    select r.id,r.organization_id,r.branch_id,r.product_id,r.stock_lot_id,r.movement_type,r.quantity,r.unit_cost,r.reference_type,r.reference_id,r.invoice_id,r.invoice_item_id,r.notes,r.created_by,r.created_at from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.stock_movements,s.payload) r
    where s.job_id=p_job and s.table_name='stock_movements' order by s.target_id;

  insert into public.supplier_purchase_items(id,organization_id,purchase_id,product_id,product_name,quantity,unit_cost,line_total,stock_lot_id,notes,created_at)
    select r.id,r.organization_id,r.purchase_id,r.product_id,r.product_name,r.quantity,r.unit_cost,r.line_total,r.stock_lot_id,r.notes,r.created_at from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.supplier_purchase_items,s.payload) r
    where s.job_id=p_job and s.table_name='supplier_purchase_items' order by s.target_id;

  insert into public.return_items(id,organization_id,return_id,invoice_id,invoice_item_id,product_id,item_name,item_type,quantity,unit_price,line_total,restock,created_at,restock_quantity)
    select r.id,r.organization_id,r.return_id,r.invoice_id,r.invoice_item_id,r.product_id,r.item_name,r.item_type,r.quantity,r.unit_price,r.line_total,r.restock,r.created_at,r.restock_quantity from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.return_items,s.payload) r
    where s.job_id=p_job and s.table_name='return_items' order by s.target_id;

  insert into public.return_stock_allocations(id,organization_id,return_id,return_item_id,product_id,stock_lot_id,quantity,unit_cost,created_at)
    select r.id,r.organization_id,r.return_id,r.return_item_id,r.product_id,r.stock_lot_id,r.quantity,r.unit_cost,r.created_at from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.return_stock_allocations,s.payload) r
    where s.job_id=p_job and s.table_name='return_stock_allocations' order by s.target_id;

  insert into public.invoice_payment_allocations(id,organization_id,customer_id,invoice_id,credit_payment_id,allocation_kind,amount,created_at)
    select r.id,r.organization_id,r.customer_id,r.invoice_id,r.credit_payment_id,r.allocation_kind,r.amount,r.created_at from backup_private.staged_rows s
      cross join lateral jsonb_populate_record(null::public.invoice_payment_allocations,s.payload) r
    where s.job_id=p_job and s.table_name='invoice_payment_allocations';

  insert into public.return_item_source_allocations(id,organization_id,return_id,return_item_id,invoice_item_id,product_id,sale_allocation_id,stock_lot_id,quantity,restock_quantity,unit_cost,created_at)
    select r.id,r.organization_id,r.return_id,r.return_item_id,r.invoice_item_id,r.product_id,r.sale_allocation_id,r.stock_lot_id,r.quantity,r.restock_quantity,r.unit_cost,r.created_at from backup_private.staged_rows s
      cross join lateral jsonb_populate_record(null::public.return_item_source_allocations,s.payload) r
    where s.job_id=p_job and s.table_name='return_item_source_allocations';

end; $$;

CREATE OR REPLACE FUNCTION backup_private.check_references(p_job uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare v_job backup_private.jobs := backup_private.owned_job(p_job);
begin

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='product_categories'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved product_categories.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='suppliers'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved suppliers.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='customers'
    and s.payload->>'branch_id' is not null and not exists(select 1 from public.branches p where p.id=(s.payload->>'branch_id')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved customers.branch_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='customers'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved customers.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='products'
    and s.payload->>'branch_id' is not null and not exists(select 1 from public.branches p where p.id=(s.payload->>'branch_id')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved products.branch_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='products'
    and s.payload->>'category_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='product_categories' and p.target_id=(s.payload->>'category_id')::uuid)) then
    raise exception 'Unresolved products.category_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='products'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved products.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='products'
    and s.payload->>'sell_at_loss_updated_by' is not null and not exists(select 1 from public.profiles p where p.id=(s.payload->>'sell_at_loss_updated_by')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved products.sell_at_loss_updated_by reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='products'
    and s.payload->>'supplier_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='suppliers' and p.target_id=(s.payload->>'supplier_id')::uuid)) then
    raise exception 'Unresolved products.supplier_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoices'
    and s.payload->>'branch_id' is not null and not exists(select 1 from public.branches p where p.id=(s.payload->>'branch_id')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved invoices.branch_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoices'
    and s.payload->>'created_by' is not null and not exists(select 1 from public.profiles p where p.id=(s.payload->>'created_by')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved invoices.created_by reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoices'
    and s.payload->>'customer_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='customers' and p.target_id=(s.payload->>'customer_id')::uuid)) then
    raise exception 'Unresolved invoices.customer_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoices'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved invoices.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='credit_payments'
    and s.payload->>'branch_id' is not null and not exists(select 1 from public.branches p where p.id=(s.payload->>'branch_id')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved credit_payments.branch_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='credit_payments'
    and s.payload->>'customer_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='customers' and p.target_id=(s.payload->>'customer_id')::uuid)) then
    raise exception 'Unresolved credit_payments.customer_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='credit_payments'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved credit_payments.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='credit_payments'
    and s.payload->>'received_by' is not null and not exists(select 1 from public.profiles p where p.id=(s.payload->>'received_by')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved credit_payments.received_by reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='customer_write_offs'
    and s.payload->>'branch_id' is not null and not exists(select 1 from public.branches p where p.id=(s.payload->>'branch_id')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved customer_write_offs.branch_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='customer_write_offs'
    and s.payload->>'customer_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='customers' and p.target_id=(s.payload->>'customer_id')::uuid)) then
    raise exception 'Unresolved customer_write_offs.customer_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='customer_write_offs'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved customer_write_offs.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='customer_write_offs'
    and s.payload->>'written_by' is not null and not exists(select 1 from public.profiles p where p.id=(s.payload->>'written_by')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved customer_write_offs.written_by reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_purchases'
    and s.payload->>'branch_id' is not null and not exists(select 1 from public.branches p where p.id=(s.payload->>'branch_id')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved supplier_purchases.branch_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_purchases'
    and s.payload->>'created_by' is not null and not exists(select 1 from public.profiles p where p.id=(s.payload->>'created_by')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved supplier_purchases.created_by reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_purchases'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved supplier_purchases.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_purchases'
    and s.payload->>'supplier_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='suppliers' and p.target_id=(s.payload->>'supplier_id')::uuid)) then
    raise exception 'Unresolved supplier_purchases.supplier_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_write_offs'
    and s.payload->>'branch_id' is not null and not exists(select 1 from public.branches p where p.id=(s.payload->>'branch_id')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved supplier_write_offs.branch_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_write_offs'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved supplier_write_offs.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_write_offs'
    and s.payload->>'supplier_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='suppliers' and p.target_id=(s.payload->>'supplier_id')::uuid)) then
    raise exception 'Unresolved supplier_write_offs.supplier_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_write_offs'
    and s.payload->>'written_by' is not null and not exists(select 1 from public.profiles p where p.id=(s.payload->>'written_by')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved supplier_write_offs.written_by reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='product_stock_lots'
    and s.payload->>'branch_id' is not null and not exists(select 1 from public.branches p where p.id=(s.payload->>'branch_id')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved product_stock_lots.branch_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='product_stock_lots'
    and s.payload->>'created_by' is not null and not exists(select 1 from public.profiles p where p.id=(s.payload->>'created_by')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved product_stock_lots.created_by reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='product_stock_lots'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved product_stock_lots.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='product_stock_lots'
    and s.payload->>'product_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='products' and p.target_id=(s.payload->>'product_id')::uuid)) then
    raise exception 'Unresolved product_stock_lots.product_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='product_stock_lots'
    and s.payload->>'supplier_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='suppliers' and p.target_id=(s.payload->>'supplier_id')::uuid)) then
    raise exception 'Unresolved product_stock_lots.supplier_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoice_items'
    and s.payload->>'invoice_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='invoices' and p.target_id=(s.payload->>'invoice_id')::uuid)) then
    raise exception 'Unresolved invoice_items.invoice_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoice_items'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved invoice_items.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoice_items'
    and s.payload->>'product_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='products' and p.target_id=(s.payload->>'product_id')::uuid)) then
    raise exception 'Unresolved invoice_items.product_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='payments'
    and s.payload->>'branch_id' is not null and not exists(select 1 from public.branches p where p.id=(s.payload->>'branch_id')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved payments.branch_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='payments'
    and s.payload->>'customer_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='customers' and p.target_id=(s.payload->>'customer_id')::uuid)) then
    raise exception 'Unresolved payments.customer_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='payments'
    and s.payload->>'invoice_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='invoices' and p.target_id=(s.payload->>'invoice_id')::uuid)) then
    raise exception 'Unresolved payments.invoice_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='payments'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved payments.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='payments'
    and s.payload->>'received_by' is not null and not exists(select 1 from public.profiles p where p.id=(s.payload->>'received_by')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved payments.received_by reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='returns'
    and s.payload->>'branch_id' is not null and not exists(select 1 from public.branches p where p.id=(s.payload->>'branch_id')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved returns.branch_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='returns'
    and s.payload->>'created_by' is not null and not exists(select 1 from public.profiles p where p.id=(s.payload->>'created_by')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved returns.created_by reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='returns'
    and s.payload->>'customer_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='customers' and p.target_id=(s.payload->>'customer_id')::uuid)) then
    raise exception 'Unresolved returns.customer_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='returns'
    and s.payload->>'invoice_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='invoices' and p.target_id=(s.payload->>'invoice_id')::uuid)) then
    raise exception 'Unresolved returns.invoice_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='returns'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved returns.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_payments'
    and s.payload->>'branch_id' is not null and not exists(select 1 from public.branches p where p.id=(s.payload->>'branch_id')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved supplier_payments.branch_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_payments'
    and s.payload->>'created_by' is not null and not exists(select 1 from public.profiles p where p.id=(s.payload->>'created_by')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved supplier_payments.created_by reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_payments'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved supplier_payments.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_payments'
    and s.payload->>'purchase_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='supplier_purchases' and p.target_id=(s.payload->>'purchase_id')::uuid)) then
    raise exception 'Unresolved supplier_payments.purchase_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_payments'
    and s.payload->>'supplier_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='suppliers' and p.target_id=(s.payload->>'supplier_id')::uuid)) then
    raise exception 'Unresolved supplier_payments.supplier_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='customer_ledger_entries'
    and s.payload->>'branch_id' is not null and not exists(select 1 from public.branches p where p.id=(s.payload->>'branch_id')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved customer_ledger_entries.branch_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='customer_ledger_entries'
    and s.payload->>'created_by' is not null and not exists(select 1 from public.profiles p where p.id=(s.payload->>'created_by')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved customer_ledger_entries.created_by reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='customer_ledger_entries'
    and s.payload->>'credit_payment_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='credit_payments' and p.target_id=(s.payload->>'credit_payment_id')::uuid)) then
    raise exception 'Unresolved customer_ledger_entries.credit_payment_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='customer_ledger_entries'
    and s.payload->>'customer_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='customers' and p.target_id=(s.payload->>'customer_id')::uuid)) then
    raise exception 'Unresolved customer_ledger_entries.customer_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='customer_ledger_entries'
    and s.payload->>'invoice_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='invoices' and p.target_id=(s.payload->>'invoice_id')::uuid)) then
    raise exception 'Unresolved customer_ledger_entries.invoice_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='customer_ledger_entries'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved customer_ledger_entries.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='customer_ledger_entries'
    and s.payload->>'payment_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='payments' and p.target_id=(s.payload->>'payment_id')::uuid)) then
    raise exception 'Unresolved customer_ledger_entries.payment_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_ledger_entries'
    and s.payload->>'branch_id' is not null and not exists(select 1 from public.branches p where p.id=(s.payload->>'branch_id')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved supplier_ledger_entries.branch_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_ledger_entries'
    and s.payload->>'created_by' is not null and not exists(select 1 from public.profiles p where p.id=(s.payload->>'created_by')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved supplier_ledger_entries.created_by reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_ledger_entries'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved supplier_ledger_entries.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_ledger_entries'
    and s.payload->>'payment_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='supplier_payments' and p.target_id=(s.payload->>'payment_id')::uuid)) then
    raise exception 'Unresolved supplier_ledger_entries.payment_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_ledger_entries'
    and s.payload->>'purchase_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='supplier_purchases' and p.target_id=(s.payload->>'purchase_id')::uuid)) then
    raise exception 'Unresolved supplier_ledger_entries.purchase_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_ledger_entries'
    and s.payload->>'supplier_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='suppliers' and p.target_id=(s.payload->>'supplier_id')::uuid)) then
    raise exception 'Unresolved supplier_ledger_entries.supplier_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoice_item_stock_allocations'
    and s.payload->>'invoice_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='invoices' and p.target_id=(s.payload->>'invoice_id')::uuid)) then
    raise exception 'Unresolved invoice_item_stock_allocations.invoice_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoice_item_stock_allocations'
    and s.payload->>'invoice_item_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='invoice_items' and p.target_id=(s.payload->>'invoice_item_id')::uuid)) then
    raise exception 'Unresolved invoice_item_stock_allocations.invoice_item_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoice_item_stock_allocations'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved invoice_item_stock_allocations.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoice_item_stock_allocations'
    and s.payload->>'product_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='products' and p.target_id=(s.payload->>'product_id')::uuid)) then
    raise exception 'Unresolved invoice_item_stock_allocations.product_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoice_item_stock_allocations'
    and s.payload->>'stock_lot_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='product_stock_lots' and p.target_id=(s.payload->>'stock_lot_id')::uuid)) then
    raise exception 'Unresolved invoice_item_stock_allocations.stock_lot_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='stock_movements'
    and s.payload->>'branch_id' is not null and not exists(select 1 from public.branches p where p.id=(s.payload->>'branch_id')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved stock_movements.branch_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='stock_movements'
    and s.payload->>'created_by' is not null and not exists(select 1 from public.profiles p where p.id=(s.payload->>'created_by')::uuid and p.organization_id=v_job.organization_id)) then
    raise exception 'Unresolved stock_movements.created_by reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='stock_movements'
    and s.payload->>'invoice_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='invoices' and p.target_id=(s.payload->>'invoice_id')::uuid)) then
    raise exception 'Unresolved stock_movements.invoice_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='stock_movements'
    and s.payload->>'invoice_item_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='invoice_items' and p.target_id=(s.payload->>'invoice_item_id')::uuid)) then
    raise exception 'Unresolved stock_movements.invoice_item_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='stock_movements'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved stock_movements.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='stock_movements'
    and s.payload->>'product_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='products' and p.target_id=(s.payload->>'product_id')::uuid)) then
    raise exception 'Unresolved stock_movements.product_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='stock_movements'
    and s.payload->>'stock_lot_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='product_stock_lots' and p.target_id=(s.payload->>'stock_lot_id')::uuid)) then
    raise exception 'Unresolved stock_movements.stock_lot_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_purchase_items'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved supplier_purchase_items.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_purchase_items'
    and s.payload->>'product_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='products' and p.target_id=(s.payload->>'product_id')::uuid)) then
    raise exception 'Unresolved supplier_purchase_items.product_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_purchase_items'
    and s.payload->>'purchase_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='supplier_purchases' and p.target_id=(s.payload->>'purchase_id')::uuid)) then
    raise exception 'Unresolved supplier_purchase_items.purchase_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_purchase_items'
    and s.payload->>'stock_lot_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='product_stock_lots' and p.target_id=(s.payload->>'stock_lot_id')::uuid)) then
    raise exception 'Unresolved supplier_purchase_items.stock_lot_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_items'
    and s.payload->>'invoice_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='invoices' and p.target_id=(s.payload->>'invoice_id')::uuid)) then
    raise exception 'Unresolved return_items.invoice_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_items'
    and s.payload->>'invoice_item_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='invoice_items' and p.target_id=(s.payload->>'invoice_item_id')::uuid)) then
    raise exception 'Unresolved return_items.invoice_item_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_items'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved return_items.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_items'
    and s.payload->>'product_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='products' and p.target_id=(s.payload->>'product_id')::uuid)) then
    raise exception 'Unresolved return_items.product_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_items'
    and s.payload->>'return_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='returns' and p.target_id=(s.payload->>'return_id')::uuid)) then
    raise exception 'Unresolved return_items.return_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_stock_allocations'
    and s.payload->>'organization_id' is not null and not exists(select 1 from public.organizations p where p.id=(s.payload->>'organization_id')::uuid and p.id=v_job.organization_id)) then
    raise exception 'Unresolved return_stock_allocations.organization_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_stock_allocations'
    and s.payload->>'product_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='products' and p.target_id=(s.payload->>'product_id')::uuid)) then
    raise exception 'Unresolved return_stock_allocations.product_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_stock_allocations'
    and s.payload->>'return_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='returns' and p.target_id=(s.payload->>'return_id')::uuid)) then
    raise exception 'Unresolved return_stock_allocations.return_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_stock_allocations'
    and s.payload->>'return_item_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='return_items' and p.target_id=(s.payload->>'return_item_id')::uuid)) then
    raise exception 'Unresolved return_stock_allocations.return_item_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_stock_allocations'
    and s.payload->>'stock_lot_id' is not null and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job and p.table_name='product_stock_lots' and p.target_id=(s.payload->>'stock_lot_id')::uuid)) then
    raise exception 'Unresolved return_stock_allocations.stock_lot_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='product_categories'
    and s.payload->>'organization_id' is not null and s.payload->>'name' is not null group by s.payload->>'organization_id',s.payload->>'name' having count(*)>1) then
    raise exception 'Duplicate product_categories_organization_id_name_key in backup.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoices'
    and s.payload->>'organization_id' is not null and s.payload->>'invoice_no' is not null group by s.payload->>'organization_id',s.payload->>'invoice_no' having count(*)>1) then
    raise exception 'Duplicate invoices_organization_id_invoice_no_key in backup.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='supplier_purchases'
    and s.payload->>'organization_id' is not null and s.payload->>'purchase_no' is not null group by s.payload->>'organization_id',s.payload->>'purchase_no' having count(*)>1) then
    raise exception 'Duplicate supplier_purchases_organization_id_purchase_no_key in backup.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='returns'
    and s.payload->>'organization_id' is not null and s.payload->>'return_no' is not null group by s.payload->>'organization_id',s.payload->>'return_no' having count(*)>1) then
    raise exception 'Duplicate returns_organization_id_return_no_key in backup.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoice_payment_allocations'
    and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job
      and p.table_name='customers' and p.target_id=(s.payload->>'customer_id')::uuid)) then
    raise exception 'Unresolved invoice_payment_allocations.customer_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoice_payment_allocations'
    and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job
      and p.table_name='invoices' and p.target_id=(s.payload->>'invoice_id')::uuid)) then
    raise exception 'Unresolved invoice_payment_allocations.invoice_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoice_payment_allocations'
    and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job
      and p.table_name='credit_payments' and p.target_id=(s.payload->>'credit_payment_id')::uuid)) then
    raise exception 'Unresolved invoice_payment_allocations.credit_payment_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_item_source_allocations'
    and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job
      and p.table_name='returns' and p.target_id=(s.payload->>'return_id')::uuid)) then
    raise exception 'Unresolved return_item_source_allocations.return_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_item_source_allocations'
    and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job
      and p.table_name='return_items' and p.target_id=(s.payload->>'return_item_id')::uuid)) then
    raise exception 'Unresolved return_item_source_allocations.return_item_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_item_source_allocations'
    and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job
      and p.table_name='invoice_items' and p.target_id=(s.payload->>'invoice_item_id')::uuid)) then
    raise exception 'Unresolved return_item_source_allocations.invoice_item_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_item_source_allocations'
    and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job
      and p.table_name='products' and p.target_id=(s.payload->>'product_id')::uuid)) then
    raise exception 'Unresolved return_item_source_allocations.product_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_item_source_allocations'
    and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job
      and p.table_name='invoice_item_stock_allocations' and p.target_id=(s.payload->>'sale_allocation_id')::uuid)) then
    raise exception 'Unresolved return_item_source_allocations.sale_allocation_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_item_source_allocations'
    and not exists(select 1 from backup_private.staged_rows p where p.job_id=p_job
      and p.table_name='product_stock_lots' and p.target_id=(s.payload->>'stock_lot_id')::uuid)) then
    raise exception 'Unresolved return_item_source_allocations.stock_lot_id reference.' using errcode='23503'; end if;

  if exists(select 1 from backup_private.staged_rows a
    join backup_private.staged_rows i on i.job_id=p_job and i.table_name='invoices' and i.target_id=(a.payload->>'invoice_id')::uuid
    join backup_private.staged_rows p on p.job_id=p_job and p.table_name='credit_payments' and p.target_id=(a.payload->>'credit_payment_id')::uuid
    where a.job_id=p_job and a.table_name='invoice_payment_allocations'
      and (a.payload->>'customer_id' is distinct from i.payload->>'customer_id'
        or a.payload->>'customer_id' is distinct from p.payload->>'customer_id'))
    or exists(select 1 from backup_private.staged_rows a
      join backup_private.staged_rows p on p.job_id=p_job and p.table_name='credit_payments' and p.target_id=(a.payload->>'credit_payment_id')::uuid
      where a.job_id=p_job and a.table_name='invoice_payment_allocations'
      group by p.target_id,p.payload having sum((a.payload->>'amount')::numeric)>(p.payload->>'amount')::numeric) then
    raise exception 'Invoice payment allocations do not match their actual receipts.' using errcode='23514'; end if;

  if exists(select 1 from backup_private.staged_rows a
    join backup_private.staged_rows r on r.job_id=p_job and r.table_name='return_items' and r.target_id=(a.payload->>'return_item_id')::uuid
    join backup_private.staged_rows s on s.job_id=p_job and s.table_name='invoice_item_stock_allocations' and s.target_id=(a.payload->>'sale_allocation_id')::uuid
    where a.job_id=p_job and a.table_name='return_item_source_allocations'
      and (a.payload->>'return_id' is distinct from r.payload->>'return_id'
        or a.payload->>'invoice_item_id' is distinct from r.payload->>'invoice_item_id'
        or a.payload->>'product_id' is distinct from r.payload->>'product_id'
        or a.payload->>'invoice_item_id' is distinct from s.payload->>'invoice_item_id'
        or a.payload->>'product_id' is distinct from s.payload->>'product_id'
        or a.payload->>'stock_lot_id' is distinct from s.payload->>'stock_lot_id'
        or (a.payload->>'unit_cost')::numeric is distinct from (s.payload->>'unit_cost')::numeric))
    or exists(select 1 from backup_private.staged_rows a
      join backup_private.staged_rows s on s.job_id=p_job and s.table_name='invoice_item_stock_allocations' and s.target_id=(a.payload->>'sale_allocation_id')::uuid
      where a.job_id=p_job and a.table_name='return_item_source_allocations'
      group by s.target_id,s.payload having sum((a.payload->>'quantity')::integer)>(s.payload->>'quantity')::integer)
    or exists(select 1 from backup_private.staged_rows a
      join backup_private.staged_rows r on r.job_id=p_job and r.table_name='return_items' and r.target_id=(a.payload->>'return_item_id')::uuid
      where a.job_id=p_job and a.table_name='return_item_source_allocations'
      group by r.target_id,r.payload having sum((a.payload->>'quantity')::integer)>(r.payload->>'quantity')::integer
        or sum((a.payload->>'restock_quantity')::integer)>coalesce((r.payload->>'restock_quantity')::integer,(r.payload->>'quantity')::integer)) then
    raise exception 'Returned stock provenance does not match its original sale or return.' using errcode='23514'; end if;

end; $$;

CREATE OR REPLACE FUNCTION backup_private.check_collisions(p_job uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare v_job backup_private.jobs := backup_private.owned_job(p_job);
begin

  if exists(select 1 from backup_private.staged_rows s join public.product_categories t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='product_categories') then
    raise exception 'A product_categories target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.suppliers t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='suppliers') then
    raise exception 'A suppliers target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.customers t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='customers') then
    raise exception 'A customers target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.products t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='products') then
    raise exception 'A products target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.invoices t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='invoices') then
    raise exception 'A invoices target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.credit_payments t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='credit_payments') then
    raise exception 'A credit_payments target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.customer_write_offs t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='customer_write_offs') then
    raise exception 'A customer_write_offs target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.supplier_purchases t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='supplier_purchases') then
    raise exception 'A supplier_purchases target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.supplier_write_offs t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='supplier_write_offs') then
    raise exception 'A supplier_write_offs target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.product_stock_lots t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='product_stock_lots') then
    raise exception 'A product_stock_lots target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.invoice_items t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='invoice_items') then
    raise exception 'A invoice_items target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.payments t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='payments') then
    raise exception 'A payments target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.returns t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='returns') then
    raise exception 'A returns target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.supplier_payments t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='supplier_payments') then
    raise exception 'A supplier_payments target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.customer_ledger_entries t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='customer_ledger_entries') then
    raise exception 'A customer_ledger_entries target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.supplier_ledger_entries t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='supplier_ledger_entries') then
    raise exception 'A supplier_ledger_entries target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.invoice_item_stock_allocations t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='invoice_item_stock_allocations') then
    raise exception 'A invoice_item_stock_allocations target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.stock_movements t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='stock_movements') then
    raise exception 'A stock_movements target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.supplier_purchase_items t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='supplier_purchase_items') then
    raise exception 'A supplier_purchase_items target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.return_items t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='return_items') then
    raise exception 'A return_items target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.return_stock_allocations t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='return_stock_allocations') then
    raise exception 'A return_stock_allocations target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='customers'
      and nullif(btrim(s.payload->>'name'),'') is not null group by lower(btrim(s.payload->>'name')) having count(*)>1) then
    raise exception 'Conflicting customers name. Account merging is not supported.' using errcode='23505'; end if;
  if (select count(*) from backup_private.staged_rows s join public.customers t
      on t.organization_id=v_job.organization_id and lower(btrim(t.name))=lower(btrim(s.payload->>'name'))
      where s.job_id=p_job and s.table_name='customers' and nullif(btrim(s.payload->>'name'),'') is not null)>0 then
    raise exception 'Conflicting customers name. Account merging is not supported.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='customers'
      and nullif(btrim(s.payload->>'phone'),'') is not null group by btrim(s.payload->>'phone') having count(*)>1) then
    raise exception 'Conflicting customers phone. Account merging is not supported.' using errcode='23505'; end if;
  if (select count(*) from backup_private.staged_rows s join public.customers t
      on t.organization_id=v_job.organization_id and btrim(t.phone)=btrim(s.payload->>'phone')
      where s.job_id=p_job and s.table_name='customers' and nullif(btrim(s.payload->>'phone'),'') is not null)>0 then
    raise exception 'Conflicting customers phone. Account merging is not supported.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='customers'
      and nullif(btrim(s.payload->>'email'),'') is not null group by lower(btrim(s.payload->>'email')) having count(*)>1) then
    raise exception 'Conflicting customers email. Account merging is not supported.' using errcode='23505'; end if;
  if (select count(*) from backup_private.staged_rows s join public.customers t
      on t.organization_id=v_job.organization_id and lower(btrim(t.email))=lower(btrim(s.payload->>'email'))
      where s.job_id=p_job and s.table_name='customers' and nullif(btrim(s.payload->>'email'),'') is not null)>0 then
    raise exception 'Conflicting customers email. Account merging is not supported.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='suppliers'
      and nullif(btrim(s.payload->>'name'),'') is not null group by lower(btrim(s.payload->>'name')) having count(*)>1) then
    raise exception 'Conflicting suppliers name. Account merging is not supported.' using errcode='23505'; end if;
  if (select count(*) from backup_private.staged_rows s join public.suppliers t
      on t.organization_id=v_job.organization_id and lower(btrim(t.name))=lower(btrim(s.payload->>'name'))
      where s.job_id=p_job and s.table_name='suppliers' and nullif(btrim(s.payload->>'name'),'') is not null)>0 then
    raise exception 'Conflicting suppliers name. Account merging is not supported.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.product_categories t
    on t.organization_id=v_job.organization_id and t.name=s.payload->>'name'
    where s.job_id=p_job and s.table_name='product_categories') then
    raise exception 'A category name already exists.' using errcode='23505'; end if;
  if exists(select 1 from backup_private.staged_rows s join public.products t
    on t.organization_id=v_job.organization_id and t.barcode=s.payload->>'barcode'
    where s.job_id=p_job and s.table_name='products' and s.payload->>'barcode' is not null)
    or exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='products'
      and s.payload->>'barcode' is not null group by s.payload->>'barcode' having count(*)>1) then
    raise exception 'A product barcode conflicts.' using errcode='23505'; end if;
  if exists(select 1 from backup_private.staged_rows s join public.invoices t
    on t.organization_id=v_job.organization_id and t.invoice_no=s.payload->>'invoice_no'
    where s.job_id=p_job and s.table_name='invoices') then
    raise exception 'An invoice number already exists.' using errcode='23505'; end if;
  if exists(select 1 from backup_private.staged_rows s join public.invoices t
    on t.organization_id=v_job.organization_id and t.checkout_idempotency_key::text=s.payload->>'checkout_idempotency_key'
    where s.job_id=p_job and s.table_name='invoices' and s.payload->>'checkout_idempotency_key' is not null)
    or exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoices'
      and s.payload->>'checkout_idempotency_key' is not null group by s.payload->>'checkout_idempotency_key' having count(*)>1) then
    raise exception 'An invoice replay identity conflicts.' using errcode='23505'; end if;
  if exists(select 1 from backup_private.staged_rows s join public.returns t
    on t.organization_id=v_job.organization_id and t.return_no=s.payload->>'return_no'
    where s.job_id=p_job and s.table_name='returns') then
    raise exception 'A return number already exists.' using errcode='23505'; end if;
  if exists(select 1 from backup_private.staged_rows s join public.supplier_purchases t
    on t.organization_id=v_job.organization_id and t.purchase_no=s.payload->>'purchase_no'
    where s.job_id=p_job and s.table_name='supplier_purchases') then
    raise exception 'A supplier purchase number already exists.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.invoice_payment_allocations t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='invoice_payment_allocations') then
    raise exception 'A invoice_payment_allocations target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s join public.return_item_source_allocations t on t.id=s.target_id
    where s.job_id=p_job and s.table_name='return_item_source_allocations') then
    raise exception 'A return_item_source_allocations target already exists. No accounting data restored.' using errcode='23505'; end if;

  if exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='invoice_payment_allocations'
      group by s.payload->>'credit_payment_id',s.payload->>'invoice_id' having count(*)>1)
    or exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='return_item_source_allocations'
      group by s.payload->>'return_item_id',s.payload->>'sale_allocation_id' having count(*)>1) then
    raise exception 'Duplicate payment or return source allocation.' using errcode='23505'; end if;
  if exists(select 1 from backup_private.staged_rows s join public.returns t
      on t.organization_id=v_job.organization_id and t.idempotency_key::text=s.payload->>'idempotency_key'
      where s.job_id=p_job and s.table_name='returns' and s.payload->>'idempotency_key' is not null)
    or exists(select 1 from backup_private.staged_rows s where s.job_id=p_job and s.table_name='returns'
      and s.payload->>'idempotency_key' is not null group by s.payload->>'idempotency_key' having count(*)>1) then
    raise exception 'A return replay identity conflicts.' using errcode='23505'; end if;

end; $$;

CREATE OR REPLACE FUNCTION ledger_private.factory_reset_core(p_organization_id uuid, p_actor_id uuid, p_reset_settings boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_return_stock_allocations_cnt int := 0;
  v_return_items_cnt int := 0;
  v_returns_cnt int := 0;
  v_invoice_item_stock_allocations_cnt int := 0;
  v_stock_movements_cnt int := 0;
  v_product_stock_lots_cnt int := 0;
  v_payments_cnt int := 0;
  v_invoice_items_cnt int := 0;
  v_invoices_cnt int := 0;
  v_customer_ledger_entries_cnt int := 0;
  v_repair_status_history_cnt int := 0;
  v_repairs_cnt int := 0;
  v_expenses_cnt int := 0;
  v_daily_closings_cnt int := 0;
  v_products_cnt int := 0;
  v_product_categories_cnt int := 0;
  v_suppliers_cnt int := 0;
  v_customers_cnt int := 0;
  v_import_row_mappings_cnt int := 0;
  v_import_jobs_cnt int := 0;
  v_supplier_ledger_entries_cnt int := 0;
  v_supplier_payments_cnt int := 0;
  v_supplier_purchase_items_cnt int := 0;
  v_supplier_purchases_cnt int := 0;

  -- Newly added table count variables
  v_cash_shifts_cnt int := 0;
  v_staff_permissions_cnt int := 0;
  v_loss_prevention_events_cnt int := 0;
  v_credit_payments_cnt int := 0;
  v_customer_write_offs_cnt int := 0;
  v_supplier_write_offs_cnt int := 0;

  v_results jsonb;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text,24637)) then
    raise exception 'Account identity is busy. Please retry Factory Reset.' using errcode='PT409';
  end if;
  perform backup_private.prepare_factory_reset(p_organization_id);

  delete from public.customer_ledger_entries where organization_id = p_organization_id;
  get diagnostics v_customer_ledger_entries_cnt = row_count;
  delete from public.supplier_ledger_entries where organization_id = p_organization_id;
  get diagnostics v_supplier_ledger_entries_cnt = row_count;
  delete from ledger_private.customer_anchors where organization_id = p_organization_id;
  delete from ledger_private.supplier_anchors where organization_id = p_organization_id;

  delete from public.return_item_source_allocations where organization_id = p_organization_id;
  delete from public.invoice_payment_allocations where organization_id = p_organization_id;

  -- 1. return_stock_allocations
  delete from public.return_stock_allocations where organization_id = p_organization_id;
  get diagnostics v_return_stock_allocations_cnt = row_count;

  -- 2. return_items
  delete from public.return_items where organization_id = p_organization_id;
  get diagnostics v_return_items_cnt = row_count;

  -- 3. returns
  delete from public.returns where organization_id = p_organization_id;
  get diagnostics v_returns_cnt = row_count;

  -- 4. supplier_ledger_entries (must precede supplier_payments + supplier_purchases)


  -- 5. supplier_payments (FK restrict to suppliers / purchases set null)
  delete from public.supplier_payments where organization_id = p_organization_id;
  get diagnostics v_supplier_payments_cnt = row_count;

  -- 6. supplier_purchase_items (FK restrict to products + cascade from purchases)
  delete from public.supplier_purchase_items where organization_id = p_organization_id;
  get diagnostics v_supplier_purchase_items_cnt = row_count;

  -- 7. supplier_purchases (FK restrict to suppliers)
  delete from public.supplier_purchases where organization_id = p_organization_id;
  get diagnostics v_supplier_purchases_cnt = row_count;

  -- 8. loss_prevention_events
  delete from public.loss_prevention_events where organization_id = p_organization_id;
  get diagnostics v_loss_prevention_events_cnt = row_count;

  -- 9. cash_shifts
  delete from public.cash_shifts where organization_id = p_organization_id;
  get diagnostics v_cash_shifts_cnt = row_count;

  -- 10. staff_permissions
  delete from public.staff_permissions where organization_id = p_organization_id;
  get diagnostics v_staff_permissions_cnt = row_count;

  -- 11. invoice_item_stock_allocations
  delete from public.invoice_item_stock_allocations where organization_id = p_organization_id;
  get diagnostics v_invoice_item_stock_allocations_cnt = row_count;

  -- 12. stock_movements
  delete from public.stock_movements where organization_id = p_organization_id;
  get diagnostics v_stock_movements_cnt = row_count;

  -- 13. product_stock_lots
  delete from public.product_stock_lots where organization_id = p_organization_id;
  get diagnostics v_product_stock_lots_cnt = row_count;

  -- 14. payments
  delete from public.payments where organization_id = p_organization_id;
  get diagnostics v_payments_cnt = row_count;

  -- 15. invoice_items
  delete from public.invoice_items where organization_id = p_organization_id;
  get diagnostics v_invoice_items_cnt = row_count;

  -- 16. invoices
  delete from public.invoices where organization_id = p_organization_id;
  get diagnostics v_invoices_cnt = row_count;

  -- 17. customer_ledger_entries


  -- 18. repair_status_history
  delete from public.repair_status_history where organization_id = p_organization_id;
  get diagnostics v_repair_status_history_cnt = row_count;

  -- 19. repairs
  delete from public.repairs where organization_id = p_organization_id;
  get diagnostics v_repairs_cnt = row_count;

  -- 20. expenses
  delete from public.expenses where organization_id = p_organization_id;
  get diagnostics v_expenses_cnt = row_count;

  -- 21. daily_closings
  delete from public.daily_closings where organization_id = p_organization_id;
  get diagnostics v_daily_closings_cnt = row_count;

  -- 22. products
  delete from public.products where organization_id = p_organization_id;
  get diagnostics v_products_cnt = row_count;

  -- 23. product_categories
  delete from public.product_categories where organization_id = p_organization_id;
  get diagnostics v_product_categories_cnt = row_count;

  -- 24. supplier_write_offs (explicit delete before suppliers)
  delete from public.supplier_write_offs where organization_id = p_organization_id;
  get diagnostics v_supplier_write_offs_cnt = row_count;

  -- 25. suppliers
  delete from public.suppliers where organization_id = p_organization_id;
  get diagnostics v_suppliers_cnt = row_count;

  -- 26. credit_payments (explicit delete before customers)
  delete from public.credit_payments where organization_id = p_organization_id;
  get diagnostics v_credit_payments_cnt = row_count;

  -- 27. customer_write_offs (explicit delete before customers)
  delete from public.customer_write_offs where organization_id = p_organization_id;
  get diagnostics v_customer_write_offs_cnt = row_count;

  -- 28. customers
  delete from public.customers where organization_id = p_organization_id;
  get diagnostics v_customers_cnt = row_count;

  -- 29. import_row_mappings
  delete from public.import_row_mappings where organization_id = p_organization_id;
  get diagnostics v_import_row_mappings_cnt = row_count;

  -- 30. import_jobs
  delete from public.import_jobs where organization_id = p_organization_id;
  get diagnostics v_import_jobs_cnt = row_count;

  if p_reset_settings then
    update public.app_settings
    set shop_name = 'Gadget Zone',
        business_subtitle = 'Mobile & Accessories Hub',
        phone = null,
        email = null,
        address = null,
        invoice_template = 'standard',
        theme_accent = 'blue',
        receipt_footer = null,
        settings = '{}'::jsonb
    where organization_id = p_organization_id;
  end if;

  insert into public.audit_logs (
    organization_id,
    actor_id,
    module,
    action,
    details,
    metadata
  ) values (
    p_organization_id,
    p_actor_id,
    'settings',
    'settings.factory_reset_completed',
    'Wiped all business data and restored factory defaults for the organization.',
    jsonb_build_object('reset_settings', p_reset_settings)
  );

  v_results := jsonb_build_object(
    'return_stock_allocations', v_return_stock_allocations_cnt,
    'return_items', v_return_items_cnt,
    'returns', v_returns_cnt,
    'supplier_ledger_entries', v_supplier_ledger_entries_cnt,
    'supplier_payments', v_supplier_payments_cnt,
    'supplier_purchase_items', v_supplier_purchase_items_cnt,
    'supplier_purchases', v_supplier_purchases_cnt,
    'loss_prevention_events', v_loss_prevention_events_cnt,
    'cash_shifts', v_cash_shifts_cnt,
    'staff_permissions', v_staff_permissions_cnt,
    'invoice_item_stock_allocations', v_invoice_item_stock_allocations_cnt,
    'stock_movements', v_stock_movements_cnt,
    'product_stock_lots', v_product_stock_lots_cnt,
    'payments', v_payments_cnt,
    'invoice_items', v_invoice_items_cnt,
    'invoices', v_invoices_cnt,
    'customer_ledger_entries', v_customer_ledger_entries_cnt,
    'repair_status_history', v_repair_status_history_cnt,
    'repairs', v_repairs_cnt,
    'expenses', v_expenses_cnt,
    'daily_closings', v_daily_closings_cnt,
    'products', v_products_cnt,
    'product_categories', v_product_categories_cnt,
    'supplier_write_offs', v_supplier_write_offs_cnt,
    'suppliers', v_suppliers_cnt,
    'credit_payments', v_credit_payments_cnt,
    'customer_write_offs', v_customer_write_offs_cnt,
    'customers', v_customers_cnt,
    'import_row_mappings', v_import_row_mappings_cnt,
    'import_jobs', v_import_jobs_cnt
  );

  return v_results;
end;
$$;

grant insert (return_math_version, debt_relief, restored_cost, idempotency_key, request_payload)
  on public.returns to backup_import_executor;
grant insert (restock_quantity) on public.return_items to backup_import_executor;
grant select (idempotency_key) on public.returns to backup_collision_reader;

do $$
declare t text;
begin
  foreach t in array array['invoice_payment_allocations', 'return_item_source_allocations'] loop
    execute format('create trigger lock_currency_insert after insert on public.%I
      referencing new table as financial_rows for each statement
      execute function currency_private.lock_financial_currency()', t);
  end loop;
end;
$$;

commit;

-- Local-only, transaction-scoped fixture. The runner always ends with ROLLBACK.
do $$ declare p record; begin
  select organization_id, branch_id into strict p from public.profiles
    where role = 'owner' and is_active order by id limit 1;
  perform set_config('parity.org', p.organization_id::text, true);
  perform set_config('parity.branch', p.branch_id::text, true);
  if (select count(distinct role) from public.profiles where organization_id = p.organization_id) <> 5 then
    raise exception 'Local five-role seed is required';
  end if;
end $$;
insert into public.organizations(id, name) values
  ('82951000-0000-4000-8000-000000000001', 'POS parity foreign synthetic');
insert into public.branches(id, organization_id, name) values
  ('82951000-0000-4000-8000-000000000002', '82951000-0000-4000-8000-000000000001', 'Foreign branch'),
  ('82951000-0000-4000-8000-000000000003', current_setting('parity.org')::uuid, 'Unassigned branch');
insert into public.customers(id, organization_id, name, outstanding_balance) values
  ('82951000-0000-4000-8000-000000000101', current_setting('parity.org')::uuid, 'POS parity customer', 100),
  ('82951000-0000-4000-8000-000000000102', '82951000-0000-4000-8000-000000000001', 'Foreign customer', 0);
insert into public.products(id, organization_id, name, type, sale_price, purchase_price, stock_quantity, is_active,
  requires_provider, requires_account_number, requires_reference) values
  ('82951000-0000-4000-8000-000000000201', current_setting('parity.org')::uuid, 'POS parity physical', 'product', 100, 60, 20, true, false, false, false),
  ('82951000-0000-4000-8000-000000000202', current_setting('parity.org')::uuid, 'POS parity service', 'service', 500, 0, 0, true, false, false, false),
  ('82951000-0000-4000-8000-000000000203', '82951000-0000-4000-8000-000000000001', 'Foreign service', 'service', 100, 0, 0, true, false, false, false);
insert into public.product_stock_lots(id, organization_id, branch_id, product_id, quantity_received, quantity_remaining, unit_cost, purchase_date) values
  ('82951000-0000-4000-8000-000000000301', current_setting('parity.org')::uuid, current_setting('parity.branch')::uuid, '82951000-0000-4000-8000-000000000201', 10, 10, 60, '2026-01-01'),
  ('82951000-0000-4000-8000-000000000302', current_setting('parity.org')::uuid, current_setting('parity.branch')::uuid, '82951000-0000-4000-8000-000000000201', 10, 10, 80, '2026-01-02');

create function pg_temp.parity_snapshot() returns jsonb language plpgsql as $$
declare t record; result jsonb := '{}'::jsonb; signature jsonb;
begin
  for t in select schemaname, tablename from pg_tables
    where schemaname = 'public' or (schemaname = 'auth' and tablename = 'users')
    order by schemaname, tablename loop
    execute format('select jsonb_build_object(''count'', count(*), ''digest'', md5(coalesce(string_agg(md5(to_jsonb(t)::text), '''' order by md5(to_jsonb(t)::text)), ''''))) from %I.%I t', t.schemaname, t.tablename) into signature;
    result := result || jsonb_build_object(t.schemaname || '.' || t.tablename, signature);
  end loop;
  return result;
end $$;

create function pg_temp.parity_case(c jsonb) returns jsonb language plpgsql as $$
declare
  actor uuid; assigned uuid; original_active boolean; claim uuid;
  pre jsonb; post jsonb; payload jsonb; outcome jsonb := null; failure text; state text;
  sale record; replay record; invoice jsonb; items jsonb; ledger jsonb; audit jsonb;
  snap_after_sale jsonb; requested_branch uuid; customer uuid;
begin
  select id, branch_id, is_active into strict actor, assigned, original_active
    from public.profiles where organization_id = current_setting('parity.org')::uuid
      and role::text = c->>'role' order by id limit 1;
  delete from public.staff_permissions where profile_id = actor;
  if c ? 'overrides' then
    insert into public.staff_permissions(organization_id, profile_id, can_sell, can_discount, can_sell_at_loss)
    values (current_setting('parity.org')::uuid, actor, (c->'overrides'->>'can_sell')::boolean,
      (c->'overrides'->>'can_discount')::boolean, (c->'overrides'->>'can_sell_at_loss')::boolean);
  end if;
  update public.profiles set is_active = not coalesce((c->>'inactive')::boolean, false) where id = actor;
  if c ? 'profileBranch' then
    update public.profiles set branch_id = (c->>'profileBranch')::uuid where id = actor;
  end if;
  update public.products set allow_sell_at_loss = coalesce((c->>'productLoss')::boolean, false)
    where id = '82951000-0000-4000-8000-000000000201';
  requested_branch := case when c ? 'branch' then (c->>'branch')::uuid else assigned end;
  customer := case when c ? 'customer' then (c->>'customer')::uuid else '82951000-0000-4000-8000-000000000101'::uuid end;
  claim := case when c ? 'claim' then (c->>'claim')::uuid else actor end;
  payload := coalesce(c->'cart', jsonb_build_array(jsonb_build_object(
    'product_id', '82951000-0000-4000-8000-000000000201', 'quantity', 1, 'unit_price', 100, 'discount', 0)));
  pre := pg_temp.parity_snapshot();
  begin
    perform set_config('request.jwt.claim.sub', coalesce(claim::text, ''), true);
    perform set_config('request.jwt.claim.role', coalesce(c->>'dbRole', 'authenticated'), true);
    perform set_config('role', coalesce(c->>'dbRole', 'authenticated'), true);
    select * into sale from public.pos_checkout(requested_branch, customer, payload,
      coalesce((c->>'billDiscount')::numeric, 0), 'cash', coalesce((c->>'paid')::numeric, 100),
      null, 'Local POS permission parity', (c->>'loss')::boolean, 'parity-' || (c->>'name'));
    perform set_config('role', 'postgres', true);
    select to_jsonb(i) - array['id','organization_id','branch_id','customer_id','created_by','created_at','updated_at','invoice_date','checkout_idempotency_key']
      into invoice from public.invoices i where id = sale.invoice_id;
    select jsonb_agg(jsonb_build_object('type', product_type, 'quantity', quantity, 'cost', purchase_price,
      'unitPrice', unit_price, 'discount', item_discount, 'lineTotal', line_total,
      'principal', service_transaction_amount, 'commission', service_commission, 'charged', service_total_charged))
      into items from public.invoice_items where invoice_id = sale.invoice_id;
    select jsonb_agg(jsonb_build_object('direction', direction, 'amount', amount, 'balance', balance_after))
      into ledger from public.customer_ledger_entries where invoice_id = sale.invoice_id;
    select jsonb_agg(jsonb_build_object('action', action, 'staffOverride', metadata->'staff_permission_override', 'loss', metadata->'loss_amount'))
      into audit from public.audit_logs where metadata->>'invoice_id' = sale.invoice_id::text;
    outcome := jsonb_build_object('invoice', invoice, 'items', items, 'ledger', ledger, 'lossAudit', audit,
      'paymentTotal', (select coalesce(sum(amount), 0) from public.payments where invoice_id = sale.invoice_id),
      'customerBalance', (select outstanding_balance from public.customers where id = customer),
      'stock', (select stock_quantity from public.products where id = '82951000-0000-4000-8000-000000000201'),
      'lots', (select jsonb_agg(quantity_remaining order by purchase_date) from public.product_stock_lots where product_id = '82951000-0000-4000-8000-000000000201'),
      'allocatedQty', (select coalesce(sum(quantity), 0) from public.invoice_item_stock_allocations where invoice_id = sale.invoice_id),
      'fifoCost', (select coalesce(sum(quantity * unit_cost), 0) from public.invoice_item_stock_allocations where invoice_id = sale.invoice_id),
      'movements', (select count(*) from public.stock_movements where invoice_id = sale.invoice_id));
    if coalesce((c->>'replay')::boolean, false) then
      snap_after_sale := pg_temp.parity_snapshot();
      perform set_config('role', 'authenticated', true);
      select * into replay from public.pos_checkout(requested_branch, customer, payload,
        coalesce((c->>'billDiscount')::numeric, 0), 'cash', coalesce((c->>'paid')::numeric, 100),
        null, 'Local POS permission parity', (c->>'loss')::boolean, 'parity-' || (c->>'name'));
      perform set_config('role', 'postgres', true);
      if replay.invoice_id is distinct from sale.invoice_id or replay.idempotent_replay is not true
         or snap_after_sale is distinct from pg_temp.parity_snapshot() then
        raise exception 'Idempotency regression';
      end if;
      outcome := outcome || jsonb_build_object('idempotentReplay', true);
    end if;
    raise exception 'Rollback accepted case' using errcode = 'PT001';
  exception
    when sqlstate 'PT001' then null;
    when others then failure := sqlerrm; state := sqlstate; outcome := null;
  end;
  perform set_config('role', 'postgres', true);
  post := pg_temp.parity_snapshot();
  if post is distinct from pre then raise exception 'Case % left partial mutation', c->>'name'; end if;
  update public.profiles set is_active = original_active, branch_id = assigned where id = actor;
  return jsonb_build_object('name', c->>'name', 'accepted', outcome is not null,
    'sqlstate', state, 'error', failure, 'result', outcome, 'zeroPersistentMutation', true);
end $$;

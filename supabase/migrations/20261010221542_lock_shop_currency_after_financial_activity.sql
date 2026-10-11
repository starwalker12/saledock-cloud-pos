-- Base currency selection only: no conversion or financial-row rewrite.
begin;

-- Install the first-activity boundary without letting an old writer slip past it.
lock table public.organizations, public.customers, public.suppliers, public.products,
  public.repairs, public.invoices, public.invoice_items, public.payments,
  public.credit_payments, public.customer_write_offs, public.customer_ledger_entries,
  public.returns, public.return_items, public.return_stock_allocations,
  public.product_stock_lots, public.stock_movements, public.invoice_item_stock_allocations,
  public.supplier_purchases, public.supplier_purchase_items, public.supplier_payments,
  public.supplier_write_offs, public.supplier_ledger_entries, public.expenses,
  public.daily_closings, public.cash_shifts, public.loss_prevention_events,
  ledger_private.customer_anchors, ledger_private.supplier_anchors
  in access exclusive mode nowait;

alter table public.organizations add column currency_locked_at timestamptz;
comment on column public.organizations.currency_locked_at is
  'First financial activity observed. Monotonic currency safety metadata, not financial provenance.';

-- Existing facts are only inspected; their amounts, dates and trust stay untouched.
update public.organizations o set currency_locked_at = pg_catalog.transaction_timestamp()
where o.id in (
  select organization_id from public.invoices
  union select organization_id from public.invoice_items
  union select organization_id from public.payments
  union select organization_id from public.credit_payments
  union select organization_id from public.customer_write_offs
  union select organization_id from public.customer_ledger_entries
  union select organization_id from public.returns
  union select organization_id from public.return_items
  union select organization_id from public.return_stock_allocations
  union select organization_id from public.product_stock_lots
  union select organization_id from public.stock_movements
  union select organization_id from public.invoice_item_stock_allocations
  union select organization_id from public.supplier_purchases
  union select organization_id from public.supplier_purchase_items
  union select organization_id from public.supplier_payments
  union select organization_id from public.supplier_write_offs
  union select organization_id from public.supplier_ledger_entries
  union select organization_id from public.expenses
  union select organization_id from public.daily_closings
  union select organization_id from public.cash_shifts
  union select organization_id from public.loss_prevention_events
  union select organization_id from public.customers where outstanding_balance <> 0
  union select organization_id from public.suppliers where outstanding_balance <> 0
  union select organization_id from public.products where type = 'product' and stock_quantity > 0
  union select organization_id from public.repairs where estimated_cost <> 0 or advance_paid <> 0 or final_cost <> 0
  union select organization_id from ledger_private.customer_anchors where anchor_balance <> 0
  union select organization_id from ledger_private.supplier_anchors where anchor_balance <> 0
);

create schema currency_private;
revoke all on schema currency_private from public, anon, authenticated, service_role;

create function currency_private.guard_currency() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.currency_code is distinct from old.currency_code and old.currency_locked_at is not null then
      raise exception 'Currency is locked because this shop already has financial activity. Changing it would make historical amounts incorrect.';
    end if;
    if new.currency_locked_at is distinct from old.currency_locked_at then
      if old.currency_locked_at is not null or current_user not in ('postgres','supabase_admin') then
        raise exception 'The shop currency safety lock cannot be changed.';
      end if;
    end if;
    -- Preserve unknown legacy codes on unrelated settings edits, never substitute PKR.
    if new.currency_code is not distinct from old.currency_code then return new; end if;
  elsif new.currency_locked_at is not null then
    raise exception 'The shop currency safety lock is assigned by the database.';
  end if;
  if new.currency_code is null or not (new.currency_code = any (
    array['PKR','INR','USD','GBP','EUR','AUD','CAD','AED','SAR','QAR'])) then
    raise exception 'Choose a supported shop currency.';
  end if;
  return new;
end;
$$;
revoke all on function currency_private.guard_currency() from public, anon, authenticated, service_role;
create trigger shop_currency_guard before insert or update on public.organizations
  for each row execute function currency_private.guard_currency();

-- Private trigger-only authority: it can set safety metadata, not currency or money.
-- One update per organization/statement avoids per-row work on large restores.
create function currency_private.lock_financial_currency() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_filter text := '';
begin
  if tg_table_name in ('customers','suppliers') then
    v_filter := ' where outstanding_balance <> 0';
  elsif tg_table_name = 'products' then
    v_filter := ' where type = ''product'' and stock_quantity > 0';
  elsif tg_table_name = 'repairs' then
    v_filter := ' where estimated_cost <> 0 or advance_paid <> 0 or final_cost <> 0';
  elsif tg_table_schema = 'ledger_private' then
    v_filter := ' where anchor_balance <> 0';
  end if;
  for v_org in execute 'select distinct organization_id from financial_rows' || v_filter || ' order by organization_id' loop
    -- This row version also serializes first activity against currency changes
    -- at REPEATABLE READ; a stale transaction cannot relabel committed history.
    update public.organizations set currency_locked_at = pg_catalog.clock_timestamp()
      where id = v_org and currency_locked_at is null;
  end loop;
  return null;
end;
$$;
revoke all on function currency_private.lock_financial_currency() from public, anon, authenticated,
  service_role, ledger_posting_executor, ledger_reset_executor, backup_import_executor, backup_identity_executor;

do $$
declare v_relation text;
begin
  foreach v_relation in array array[
    'public.invoices','public.invoice_items','public.payments','public.credit_payments',
    'public.customer_write_offs','public.customer_ledger_entries','public.returns',
    'public.return_items','public.return_stock_allocations','public.product_stock_lots',
    'public.stock_movements','public.invoice_item_stock_allocations','public.supplier_purchases',
    'public.supplier_purchase_items','public.supplier_payments','public.supplier_write_offs',
    'public.supplier_ledger_entries','public.expenses','public.daily_closings','public.cash_shifts',
    'public.loss_prevention_events','public.customers','public.suppliers','public.products','public.repairs',
    'ledger_private.customer_anchors','ledger_private.supplier_anchors'
  ] loop
    execute format('create trigger lock_currency_insert after insert on %s
      referencing new table as financial_rows for each statement
      execute function currency_private.lock_financial_currency()',v_relation);
    execute format('create trigger lock_currency_update after update on %s
      referencing new table as financial_rows for each statement
      execute function currency_private.lock_financial_currency()',v_relation);
  end loop;
end;
$$;

commit;

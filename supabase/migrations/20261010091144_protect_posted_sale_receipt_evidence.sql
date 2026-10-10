-- Forward-only source evidence. No historical values or provenance are backfilled.
begin;

-- Drain old producers before changing their tables/privileges. A busy cutover
-- aborts completely and must be retried; it never labels an in-flight old sale.
lock table public.profiles, public.staff_permissions, public.organizations,
  public.branches, public.customers, public.products, public.product_stock_lots,
  public.invoices, public.invoice_items, public.invoice_item_stock_allocations,
  public.stock_movements, public.payments, public.credit_payments,
  public.customer_write_offs, public.customer_ledger_entries, public.audit_logs
  in access exclusive mode nowait;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_trigger t
    join pg_catalog.pg_proc p on p.oid = t.tgfoid
    join pg_catalog.pg_locks l on l.relation = t.tgrelid
    where l.pid = pg_backend_pid() and l.mode = 'AccessExclusiveLock' and l.granted
      and not t.tgisinternal
      and pg_catalog.pg_get_userbyid(p.proowner) not in
        ('postgres', 'supabase_admin', 'backup_identity_executor', 'ledger_posting_executor')
  ) then
    raise exception 'An unreviewed database callback blocks source-evidence cutover. Contact an administrator.' using errcode = '42501';
  end if;
end;
$$;

-- xid8 is a database-generated creating-transaction token, not a posting
-- sequence or chronology. POS finishes cost/loss snapshots within that one
-- transaction; those snapshots cannot subsequently be rewritten.
do $$
declare v_table text;
begin
  foreach v_table in array array['invoices','invoice_items','payments',
    'credit_payments','customer_write_offs','invoice_item_stock_allocations'] loop
    execute format('alter table public.%I
      add column source_trust_version smallint,
      add column source_effective_at timestamptz,
      add column source_transaction_id xid8,
      add constraint posted_source_provenance check (
        (source_trust_version is null and source_effective_at is null and source_transaction_id is null)
        or (source_trust_version is not null and source_trust_version = 1
          and source_effective_at is not null and source_transaction_id is not null))',v_table);
  end loop;
end;
$$;

create function ledger_private.guard_posted_source() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_invoice public.invoices%rowtype; v_item public.invoice_items%rowtype;
begin
  if tg_op = 'DELETE' then
    if current_user <> 'ledger_reset_executor' then
      raise exception 'Posted sale and receipt evidence cannot be deleted. Use an approved correction workflow.' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if current_user = 'ledger_posting_executor' and tg_table_name = 'invoices' then
      if (to_jsonb(new) - array['amount_paid','balance_due','status','updated_at'])
        is not distinct from (to_jsonb(old) - array['amount_paid','balance_due','status','updated_at']) then
        return new;
      end if;
    elsif current_user = 'ledger_posting_executor' and tg_table_name = 'invoice_items' then
      if old.source_trust_version = 1 and old.source_transaction_id = pg_catalog.pg_current_xact_id()
        and (to_jsonb(new) - array['purchase_price','allow_sell_at_loss_snapshot',
          'loss_override_reason_snapshot','effective_unit_price_snapshot','loss_amount_snapshot','updated_at'])
        is not distinct from (to_jsonb(old) - array['purchase_price','allow_sell_at_loss_snapshot',
          'loss_override_reason_snapshot','effective_unit_price_snapshot','loss_amount_snapshot','updated_at']) then
        return new;
      end if;
    end if;
    raise exception 'Posted sale and receipt evidence is immutable. Use an approved financial writer.' using errcode = '42501';
  end if;

  -- Restored history never carries local producer authority, even if a future
  -- snapshot inserter supplies provenance columns explicitly.
  if current_user = 'backup_import_executor' then
    new.source_trust_version := null;
    new.source_effective_at := null;
    new.source_transaction_id := null;
    return new;
  end if;

  if new.source_trust_version is not null or new.source_effective_at is not null
    or new.source_transaction_id is not null then
    raise exception 'Source provenance is assigned only by the approved producer.' using errcode = '42501';
  end if;
  if current_user in ('postgres','supabase_admin') then
    -- Database administration can insert legacy fixtures/history, not choose
    -- protected provenance. Database root/schema control is outside this model.
    return new;
  end if;
  if current_user <> 'ledger_posting_executor' then
    raise exception 'Posted sale and receipt evidence requires an approved financial writer.' using errcode = '42501';
  end if;

  if tg_table_name in ('invoice_items','payments','invoice_item_stock_allocations') then
    select * into v_invoice from public.invoices where id = new.invoice_id;
    if not found or v_invoice.organization_id is distinct from new.organization_id
      or v_invoice.source_trust_version is distinct from 1
      or v_invoice.source_transaction_id is distinct from pg_catalog.pg_current_xact_id() then
      raise exception 'Sale evidence must be created with its approved invoice transaction.' using errcode = '42501';
    end if;
    if tg_table_name = 'payments' then
      if new.branch_id is distinct from v_invoice.branch_id
        or new.customer_id is distinct from v_invoice.customer_id then
        raise exception 'Receipt identity must match its invoice.' using errcode = '42501';
      end if;
    elsif tg_table_name = 'invoice_item_stock_allocations' then
      select * into v_item from public.invoice_items where id = new.invoice_item_id;
      if not found or v_item.invoice_id is distinct from v_invoice.id
        or v_item.organization_id is distinct from new.organization_id
        or v_item.product_id is distinct from new.product_id
        or v_item.source_transaction_id is distinct from v_invoice.source_transaction_id
        or v_item.source_trust_version is distinct from 1 then
        raise exception 'FIFO source evidence must match its invoice item.' using errcode = '42501';
      end if;
    end if;
    new.source_effective_at := v_invoice.source_effective_at;
  else
    new.source_effective_at := pg_catalog.clock_timestamp();
  end if;
  new.source_trust_version := 1;
  new.source_transaction_id := pg_catalog.pg_current_xact_id();
  return new;
end;
$$;
alter function ledger_private.guard_posted_source() owner to ledger_posting_executor;
revoke all on function ledger_private.guard_posted_source() from public, anon, authenticated,
  service_role, backup_import_executor, backup_identity_executor, ledger_reset_executor;

revoke insert, update, delete, truncate, references, trigger
  on public.invoices, public.invoice_items, public.payments, public.credit_payments,
  public.customer_write_offs, public.invoice_item_stock_allocations
  from public, anon, authenticated, service_role;

-- Table revocation does not remove independently granted column privileges.
do $$
declare v_table text; v_columns text;
begin
  foreach v_table in array array['invoices','invoice_items','payments',
    'credit_payments','customer_write_offs','invoice_item_stock_allocations'] loop
    select string_agg(quote_ident(attname),',' order by attnum) into v_columns
      from pg_catalog.pg_attribute where attrelid = format('public.%I',v_table)::regclass
        and attnum > 0 and not attisdropped;
    execute format('revoke insert (%s), update (%s), references (%s) on public.%I
      from public, anon, authenticated, service_role',v_columns,v_columns,v_columns,v_table);
    execute format('create trigger posted_source_guard before insert or update or delete on public.%I
      for each row execute function ledger_private.guard_posted_source()',v_table);
    execute format('create trigger posted_source_truncate_guard before truncate on public.%I
      for each statement execute function ledger_private.guard_truncate()',v_table);
  end loop;
end;
$$;

drop policy "Org scoped invoice access" on public.invoices;
create policy "Org scoped invoice access" on public.invoices for select to authenticated
  using (organization_id = public.current_organization_id());
drop policy "Org scoped invoice item access" on public.invoice_items;
create policy "Org scoped invoice item access" on public.invoice_items for select to authenticated
  using (organization_id = public.current_organization_id());
drop policy "Org scoped payment access" on public.payments;
create policy "Org scoped payment access" on public.payments for select to authenticated
  using (organization_id = public.current_organization_id());
drop policy "Org scoped credit payments access" on public.credit_payments;
create policy "Org scoped credit payments access" on public.credit_payments for select to authenticated
  using (organization_id = public.current_organization_id());
drop policy "Org scoped customer write-offs access" on public.customer_write_offs;
create policy "Org scoped customer write-offs access" on public.customer_write_offs for select to authenticated
  using (organization_id = public.current_organization_id());
drop policy "Org scoped allocations access" on public.invoice_item_stock_allocations;
create policy "Org scoped allocations access" on public.invoice_item_stock_allocations for select to authenticated
  using (organization_id = public.current_organization_id());

revoke update on public.invoices, public.invoice_items from ledger_posting_executor;
grant update (amount_paid,balance_due,status) on public.invoices to ledger_posting_executor;
grant update (purchase_price,allow_sell_at_loss_snapshot,loss_override_reason_snapshot,
  effective_unit_price_snapshot,loss_amount_snapshot) on public.invoice_items to ledger_posting_executor;
-- Existing Return SELECT FOR UPDATE still needs this column privilege; the
-- source guard rejects every actual allocation UPDATE, even by the executor.
-- Existing reset/import roles and all seven reviewed writer bodies are unchanged.

-- The current typed importer normalizer is repeated below with only reserved
-- source-provenance stripping added. No accounting normalization changes.
CREATE OR REPLACE FUNCTION backup_private.normalize_row(p_table text, p_payload jsonb, p_org uuid, p_time timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
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
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','invoice_id','customer_id','return_no','status','subtotal','refund_amount','refund_method','reference_number','notes','created_by','created_at','updated_at'])) then
        raise exception 'Unsupported columns for returns.' using errcode='22023'; end if;
      v_input := jsonb_build_object('status','completed'::text,'subtotal',0,'refund_amount',0,'created_at',p_time,'updated_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.branch_id is null or r.invoice_id is null or r.return_no is null or r.status is null or r.subtotal is null or r.refund_amount is null or r.created_at is null or r.updated_at is null or (((refund_amount >= (0)::numeric))) is false or ((((refund_method IS NULL) OR (refund_method = ANY (ARRAY['cash'::text, 'card'::text, 'easypaisa'::text, 'jazzcash'::text, 'bank_transfer'::text]))))) is false or (((status = ANY (ARRAY['completed'::text, 'cancelled'::text])))) is false or (((subtotal >= (0)::numeric))) is false or ((v_input->>'subtotal')::numeric is distinct from r.subtotal and v_input ? 'subtotal') or ((v_input->>'refund_amount')::numeric is distinct from r.refund_amount and v_input ? 'refund_amount'))
        into v_result,v_bad from jsonb_populate_record(null::public.returns,v_input) r;

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
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','return_id','invoice_id','invoice_item_id','product_id','item_name','item_type','quantity','unit_price','line_total','restock','created_at'])) then
        raise exception 'Unsupported columns for return_items.' using errcode='22023'; end if;
      v_input := jsonb_build_object('restock',true,'created_at',p_time) || v_input || jsonb_build_object('organization_id',p_org);
      select to_jsonb(r), (r.id is null or r.organization_id is null or r.return_id is null or r.invoice_id is null or r.invoice_item_id is null or r.item_name is null or r.item_type is null or r.quantity is null or r.unit_price is null or r.line_total is null or r.restock is null or r.created_at is null or (((item_type = ANY (ARRAY['product'::text, 'service'::text])))) is false or (((line_total >= (0)::numeric))) is false or (((quantity > 0))) is false or (((unit_price >= (0)::numeric))) is false or ((v_input->>'unit_price')::numeric is distinct from r.unit_price and v_input ? 'unit_price') or ((v_input->>'line_total')::numeric is distinct from r.line_total and v_input ? 'line_total'))
        into v_result,v_bad from jsonb_populate_record(null::public.return_items,v_input) r;

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
    else raise exception 'Unsupported accounting relation.' using errcode='22023';
  end case;
  if v_bad then raise exception 'A staged row violates required values or exact numeric precision.' using errcode='22023'; end if;
  for v_field in select key,value from jsonb_each_text(v_result) loop
    if v_field.key=any(array['amount','balance_after','credit_limit','outstanding_balance','unit_cost',
      'purchase_price','unit_price','item_discount','line_total','service_transaction_amount','service_commission',
      'service_total_charged','effective_unit_price_snapshot','loss_amount_snapshot','subtotal','discount_total',
      'customer_credit_applied','grand_total','amount_paid','balance_due','amount_tendered','change_due','cost_amount',
      'effective_sale_amount','loss_amount','sale_price','default_commission_amount','default_commission_percent','refund_amount'])
      and v_field.value is not null and v_field.value !~ '^-?[0-9]+([.][0-9]+)?$' then
      raise exception 'A staged monetary value must be finite numeric data.' using errcode='22023';
    end if;
  end loop;
  -- Live row types now contain local-only provenance. Do not enlarge the sealed
  -- canonical business snapshot with even NULL source trust fields.
  return v_result - 'posting_sequence' - 'posting_trust_version' - 'posting_effective_at'
    - 'source_trust_version' - 'source_effective_at' - 'source_transaction_id';
end; $function$;

commit;

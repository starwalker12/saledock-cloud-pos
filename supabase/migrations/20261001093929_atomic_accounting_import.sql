-- Supported restore atomicity only. Existing authenticated business DML is unchanged.
begin;

create role backup_import_executor nologin nosuperuser nobypassrls;
create role backup_identity_executor nologin nosuperuser nobypassrls;
create role backup_collision_reader nologin nosuperuser nobypassrls;
grant backup_import_executor, backup_identity_executor, backup_collision_reader to postgres;

create schema backup_private authorization backup_import_executor;
revoke all on schema backup_private from public, anon, authenticated;
grant usage on schema backup_private to backup_identity_executor, backup_collision_reader;
grant create on schema backup_private to backup_identity_executor, backup_collision_reader;
grant usage on schema public to backup_import_executor, backup_identity_executor, backup_collision_reader;
grant execute on function public.current_organization_id() to backup_identity_executor;

-- Parse the fixed Auth function reference at creation time. Private roles need no
-- Auth schema access, including on local stacks where postgres cannot grant it.
create function backup_private.actor_id() returns uuid
language sql stable security invoker set search_path=''
begin atomic
  select auth.uid();
end;
alter function backup_private.actor_id() owner to backup_import_executor;
revoke all on function backup_private.actor_id() from public,anon,authenticated;
grant execute on function backup_private.actor_id() to backup_identity_executor,backup_collision_reader;

create table backup_private.organization_identity_locks (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  epoch bigint not null default 0 check (epoch >= 0)
);
alter table backup_private.organization_identity_locks owner to backup_identity_executor;
alter table backup_private.organization_identity_locks enable row level security;
revoke all on backup_private.organization_identity_locks from public, anon, authenticated;
grant select on backup_private.organization_identity_locks to backup_import_executor;
create policy import_epoch_read on backup_private.organization_identity_locks
  for select to backup_import_executor using (true);
insert into backup_private.organization_identity_locks(organization_id)
select id from public.organizations;

create function backup_private.provision_identity_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into backup_private.organization_identity_locks(organization_id) values (new.id);
  return new;
end;
$$;
alter function backup_private.provision_identity_lock() owner to backup_identity_executor;
revoke all on function backup_private.provision_identity_lock() from public, anon, authenticated;
create trigger provision_backup_identity_lock after insert on public.organizations
for each row execute function backup_private.provision_identity_lock();

create function backup_private.lock_identity(p_org uuid, p_nowait boolean default false)
returns bigint language plpgsql security definer set search_path = '' set lock_timeout = '250ms' as $$
declare v_epoch bigint;
begin
  if p_nowait then
    select epoch into v_epoch from backup_private.organization_identity_locks
    where organization_id = p_org for update nowait;
  else
    select epoch into v_epoch from backup_private.organization_identity_locks
    where organization_id = p_org for update;
  end if;
  if not found then raise exception 'Account identity lock is unavailable.' using errcode = '55000'; end if;
  return v_epoch;
exception when lock_not_available then
  raise exception 'Account identity is busy. Please retry this operation.' using errcode = 'PT409';
end;
$$;
alter function backup_private.lock_identity(uuid, boolean) owner to backup_identity_executor;
revoke all on function backup_private.lock_identity(uuid, boolean) from public, anon, authenticated;
grant execute on function backup_private.lock_identity(uuid, boolean) to backup_import_executor;

create function backup_private.account_identity_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if tg_op = 'UPDATE' and new.id = old.id and new.organization_id = old.organization_id
    and new.name is not distinct from old.name
    and (tg_table_name = 'suppliers' or
      ((to_jsonb(new)->'phone') is not distinct from (to_jsonb(old)->'phone')
       and (to_jsonb(new)->'email') is not distinct from (to_jsonb(old)->'email'))) then
    return new;
  end if;
  v_org := public.current_organization_id();
  -- Retain existing trusted maintenance access; it still participates in the mutex.
  if session_user not in ('postgres', 'supabase_admin') and
    current_setting('role',true) is distinct from 'service_role' and
    (v_org is null or new.organization_id <> v_org or
      (tg_op = 'UPDATE' and old.organization_id <> v_org)) then
    raise exception 'Account identity does not belong to the active organization.' using errcode = '42501';
  end if;
  -- UPDATE may already own the account tuple. Never wait here for the mutex.
  if tg_op = 'UPDATE' and old.organization_id <> new.organization_id then
    perform backup_private.lock_identity(least(old.organization_id, new.organization_id), true);
    perform backup_private.lock_identity(greatest(old.organization_id, new.organization_id), true);
  else
    perform backup_private.lock_identity(new.organization_id, true);
  end if;
  return new;
end;
$$;
alter function backup_private.account_identity_gate() owner to backup_identity_executor;
revoke all on function backup_private.account_identity_gate() from public, anon, authenticated;
create trigger backup_customer_identity_gate before insert or update on public.customers
for each row execute function backup_private.account_identity_gate();
create trigger backup_supplier_identity_gate before insert or update on public.suppliers
for each row execute function backup_private.account_identity_gate();

grant select (id, organization_id, branch_id, role, is_active) on public.profiles to backup_import_executor;
create policy backup_owner_profile_read on public.profiles for select to backup_import_executor
using (id = (select backup_private.actor_id()));
create function backup_private.owner_org() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  if backup_private.actor_id() is null then raise exception 'Owner authentication required.' using errcode = '42501'; end if;
  select organization_id into v_org from public.profiles
  where id = backup_private.actor_id() and is_active and role = 'owner' and organization_id is not null;
  if v_org is null then raise exception 'Only an active Owner can restore accounting data.' using errcode = '42501'; end if;
  return v_org;
end;
$$;
alter function backup_private.owner_org() owner to backup_import_executor;
revoke all on function backup_private.owner_org() from public, anon, authenticated;
grant execute on function backup_private.owner_org() to backup_collision_reader;

create table backup_private.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  epoch bigint not null,
  source_format text not null check (source_format in ('native', 'desktop')),
  source_version text not null check (length(source_version) between 1 and 64),
  state text not null default 'staging' check (state in (
    'staging','sealed','ready','ineligible','validation_failed','accounting_completed',
    'ancillary_pending','ancillary_failed','completed','cancelled','expired')),
  row_count integer not null default 0,
  normalized_bytes bigint not null default 0,
  chunk_count integer not null default 0,
  seal_digest text,
  declared_manifest jsonb,
  ancillary_manifest jsonb not null default '{}',
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '24 hours'
);
create unique index backup_one_upload_per_owner on backup_private.jobs(organization_id, created_by)
where state in ('staging','sealed','ready');
create table backup_private.chunks (
  job_id uuid not null references backup_private.jobs(id) on delete cascade,
  table_name text not null,
  chunk_index integer not null check (chunk_index >= 0),
  transport_digest text not null,
  content_digest text not null,
  row_count integer not null check (row_count > 0),
  normalized_bytes bigint not null,
  primary key (job_id, table_name, chunk_index)
);
create table backup_private.staged_rows (
  job_id uuid not null,
  table_name text not null,
  chunk_index integer not null,
  ordinal integer not null,
  source_id text not null check (length(source_id) between 1 and 256),
  target_id uuid not null,
  payload jsonb not null,
  content_digest text not null,
  primary key (job_id, table_name, source_id),
  unique (job_id, table_name, target_id),
  unique (job_id, table_name, chunk_index, ordinal),
  foreign key (job_id, table_name, chunk_index)
    references backup_private.chunks(job_id, table_name, chunk_index) on delete cascade
);
create table backup_private.mappings (
  job_id uuid not null references backup_private.jobs(id) on delete cascade,
  table_name text not null,
  source_id text not null,
  target_id uuid not null,
  primary key (job_id, table_name, source_id),
  unique (job_id, table_name, target_id)
);
create table backup_private.receipts (
  job_id uuid primary key references backup_private.jobs(id) on delete cascade,
  organization_id uuid not null,
  seal_digest text not null,
  epoch bigint not null,
  finalization_id uuid not null default gen_random_uuid(),
  counts jsonb not null,
  transaction_ms numeric not null,
  identity_ms numeric not null,
  committed_at timestamptz not null default clock_timestamp()
);
alter table backup_private.jobs owner to backup_import_executor;
alter table backup_private.chunks owner to backup_import_executor;
alter table backup_private.staged_rows owner to backup_import_executor;
alter table backup_private.mappings owner to backup_import_executor;
alter table backup_private.receipts owner to backup_import_executor;
alter table backup_private.jobs enable row level security;
alter table backup_private.chunks enable row level security;
alter table backup_private.staged_rows enable row level security;
alter table backup_private.mappings enable row level security;
alter table backup_private.receipts enable row level security;
revoke all on all tables in schema backup_private from public, anon, authenticated;

create function backup_private.owned_job(p_job uuid) returns backup_private.jobs
language plpgsql stable security definer set search_path = '' as $$
declare v_job backup_private.jobs; v_org uuid := backup_private.owner_org();
begin
  select * into v_job from backup_private.jobs
  where id = p_job and organization_id = v_org and created_by = backup_private.actor_id();
  if not found then raise exception 'Restore job is not available to this Owner.' using errcode = '42501'; end if;
  return v_job;
end;
$$;
alter function backup_private.owned_job(uuid) owner to backup_import_executor;
revoke all on function backup_private.owned_job(uuid) from public, anon, authenticated;
grant execute on function backup_private.owned_job(uuid) to backup_collision_reader;

create function backup_private.core_tables() returns text[] language sql immutable set search_path = '' as $$
  select array['product_categories','suppliers','customers','products','invoices',
    'credit_payments','customer_write_offs','supplier_purchases','supplier_write_offs',
    'product_stock_lots','invoice_items','payments','returns','supplier_payments',
    'customer_ledger_entries','supplier_ledger_entries','invoice_item_stock_allocations',
    'stock_movements','supplier_purchase_items','return_items','return_stock_allocations']::text[];
$$;
alter function backup_private.core_tables() owner to backup_import_executor;
revoke all on function backup_private.core_tables() from public, anon, authenticated;

create function backup_private.start_job(p_format text, p_version text, p_ancillary jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := backup_private.owner_org(); v_job backup_private.jobs; v_epoch bigint;
begin
  if p_format not in ('native','desktop') or length(p_version) not between 1 and 64
    or jsonb_typeof(p_ancillary) <> 'object' or octet_length(p_ancillary::text) > 16384 then
    raise exception 'Unsupported backup manifest.' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_each_text(p_ancillary) m where m.key <> all(array[
    'cash_shifts','expenses','repairs','daily_closings','staff_permissions','loss_prevention_events','audit_logs'])
    or m.value !~ '^[0-9]{1,8}$') then
    raise exception 'Unsupported remaining-data manifest.' using errcode='22023';
  end if;
  select epoch into v_epoch from backup_private.organization_identity_locks where organization_id = v_org;
  if not found then raise exception 'Organization restore lock is unavailable.' using errcode = '55000'; end if;
  update backup_private.jobs set state = 'expired'
    where organization_id = v_org and created_by = backup_private.actor_id() and expires_at <= clock_timestamp()
      and state in ('staging','sealed','ready');
  delete from backup_private.chunks c using backup_private.jobs j
    where c.job_id = j.id and j.organization_id = v_org and j.created_by = backup_private.actor_id()
      and (j.state in ('expired','cancelled','ineligible','validation_failed')
        or (j.expires_at <= clock_timestamp() and j.state in
          ('accounting_completed','ancillary_pending','ancillary_failed','completed')));
  insert into backup_private.jobs(organization_id,created_by,epoch,source_format,source_version,ancillary_manifest)
    values(v_org,backup_private.actor_id(),v_epoch,p_format,p_version,p_ancillary) returning * into v_job;
  return jsonb_build_object('ok',true,'job_id',v_job.id,'state',v_job.state,'epoch',v_job.epoch,
    'actor_id',backup_private.actor_id(),'branch_id',(select branch_id from public.profiles where id=backup_private.actor_id()));
end;
$$;
alter function backup_private.start_job(text,text,jsonb) owner to backup_import_executor;
revoke all on function backup_private.start_job(text,text,jsonb) from public, anon, authenticated;

-- Fixed-schema projections, validation and finalization follow below.
-- Static projections from current-main schema; no payload-controlled SQL identifiers.
create function backup_private.normalize_row(p_table text, p_payload jsonb, p_org uuid, p_time timestamptz)
returns jsonb language plpgsql set search_path = '' set timezone = 'UTC' as $$
declare v_input jsonb; v_result jsonb; v_bad boolean; v_field record;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or p_payload->>'id' is null then
    raise exception 'A staged row requires an explicit target identity.' using errcode='22023';
  end if;
  -- Imported provenance is never accepted. A later trust cutover defines new restore anchors.
  select coalesce(jsonb_object_agg(key,value),'{}') into v_input from jsonb_each(p_payload)
    where key not in ('posting_sequence','posting_trust_version') and key not like 'ledger_anchor_%';
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
  return v_result;
end; $$;
alter function backup_private.normalize_row(text,jsonb,uuid,timestamptz) owner to backup_import_executor;
revoke all on function backup_private.normalize_row(text,jsonb,uuid,timestamptz) from public,anon,authenticated;

grant insert (id,organization_id,name,is_active,created_at,updated_at,description) on public.product_categories to backup_import_executor;
create policy backup_snapshot_insert on public.product_categories for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.product_categories to backup_collision_reader;
create policy backup_native_collision on public.product_categories for select to backup_collision_reader using (true);

grant insert (id,organization_id,name,company,phone,email,address,notes,is_active,created_at,updated_at,outstanding_balance) on public.suppliers to backup_import_executor;
create policy backup_snapshot_insert on public.suppliers for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.suppliers to backup_collision_reader;
create policy backup_native_collision on public.suppliers for select to backup_collision_reader using (true);

grant insert (id,organization_id,branch_id,name,phone,email,address,notes,credit_limit,is_archived,archived_at,created_at,updated_at,outstanding_balance) on public.customers to backup_import_executor;
create policy backup_snapshot_insert on public.customers for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.customers to backup_collision_reader;
create policy backup_native_collision on public.customers for select to backup_collision_reader using (true);

grant insert (id,organization_id,branch_id,category_id,supplier_id,name,sku,barcode,type,purchase_price,sale_price,stock_quantity,minimum_stock,default_warranty,service_type,service_pricing_mode,default_commission_amount,default_commission_percent,requires_account_number,requires_provider,requires_reference,notes,is_active,created_at,updated_at,allow_sell_at_loss,sell_at_loss_reason,sell_at_loss_updated_at,sell_at_loss_updated_by,image_path) on public.products to backup_import_executor;
create policy backup_snapshot_insert on public.products for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.products to backup_collision_reader;
create policy backup_native_collision on public.products for select to backup_collision_reader using (true);

grant insert (id,organization_id,branch_id,customer_id,invoice_no,status,subtotal,discount_total,customer_credit_applied,grand_total,amount_paid,balance_due,note,created_by,invoice_date,created_at,updated_at,amount_tendered,change_due,checkout_idempotency_key) on public.invoices to backup_import_executor;
create policy backup_snapshot_insert on public.invoices for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.invoices to backup_collision_reader;
create policy backup_native_collision on public.invoices for select to backup_collision_reader using (true);

grant insert (id,organization_id,branch_id,customer_id,amount,method,reference_number,notes,received_by,created_at,updated_at) on public.credit_payments to backup_import_executor;
create policy backup_snapshot_insert on public.credit_payments for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.credit_payments to backup_collision_reader;
create policy backup_native_collision on public.credit_payments for select to backup_collision_reader using (true);

grant insert (id,organization_id,branch_id,customer_id,amount,reason,written_by,created_at,updated_at) on public.customer_write_offs to backup_import_executor;
create policy backup_snapshot_insert on public.customer_write_offs for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.customer_write_offs to backup_collision_reader;
create policy backup_native_collision on public.customer_write_offs for select to backup_collision_reader using (true);

grant insert (id,organization_id,branch_id,supplier_id,purchase_no,status,purchase_date,subtotal,discount_total,grand_total,amount_paid,balance_due,reference_no,notes,created_by,created_at,updated_at) on public.supplier_purchases to backup_import_executor;
create policy backup_snapshot_insert on public.supplier_purchases for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.supplier_purchases to backup_collision_reader;
create policy backup_native_collision on public.supplier_purchases for select to backup_collision_reader using (true);

grant insert (id,organization_id,branch_id,supplier_id,amount,reason,written_by,created_at,updated_at) on public.supplier_write_offs to backup_import_executor;
create policy backup_snapshot_insert on public.supplier_write_offs for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.supplier_write_offs to backup_collision_reader;
create policy backup_native_collision on public.supplier_write_offs for select to backup_collision_reader using (true);

grant insert (id,organization_id,branch_id,product_id,supplier_id,lot_number,purchase_date,quantity_received,quantity_remaining,unit_cost,notes,is_active,created_by,created_at,updated_at) on public.product_stock_lots to backup_import_executor;
create policy backup_snapshot_insert on public.product_stock_lots for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.product_stock_lots to backup_collision_reader;
create policy backup_native_collision on public.product_stock_lots for select to backup_collision_reader using (true);

grant insert (id,organization_id,invoice_id,product_id,product_name,product_type,quantity,purchase_price,unit_price,item_discount,line_total,service_provider,service_direction,service_account_number,service_receiver_account,service_reference_no,service_transaction_amount,service_commission,service_total_charged,service_note,created_at,updated_at,allow_sell_at_loss_snapshot,loss_override_reason_snapshot,effective_unit_price_snapshot,loss_amount_snapshot) on public.invoice_items to backup_import_executor;
create policy backup_snapshot_insert on public.invoice_items for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.invoice_items to backup_collision_reader;
create policy backup_native_collision on public.invoice_items for select to backup_collision_reader using (true);

grant insert (id,organization_id,branch_id,invoice_id,customer_id,method,amount,reference_no,note,received_by,paid_at,created_at,updated_at) on public.payments to backup_import_executor;
create policy backup_snapshot_insert on public.payments for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.payments to backup_collision_reader;
create policy backup_native_collision on public.payments for select to backup_collision_reader using (true);

grant insert (id,organization_id,branch_id,invoice_id,customer_id,return_no,status,subtotal,refund_amount,refund_method,reference_number,notes,created_by,created_at,updated_at) on public.returns to backup_import_executor;
create policy backup_snapshot_insert on public.returns for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.returns to backup_collision_reader;
create policy backup_native_collision on public.returns for select to backup_collision_reader using (true);

grant insert (id,organization_id,branch_id,supplier_id,purchase_id,method,amount,reference_no,note,paid_at,created_by,created_at,updated_at) on public.supplier_payments to backup_import_executor;
create policy backup_snapshot_insert on public.supplier_payments for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.supplier_payments to backup_collision_reader;
create policy backup_native_collision on public.supplier_payments for select to backup_collision_reader using (true);

grant insert (id,organization_id,branch_id,customer_id,invoice_id,payment_id,credit_payment_id,entry_type,direction,amount,balance_after,description,reference_number,created_by,created_at,updated_at) on public.customer_ledger_entries to backup_import_executor;
create policy backup_snapshot_insert on public.customer_ledger_entries for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.customer_ledger_entries to backup_collision_reader;
create policy backup_native_collision on public.customer_ledger_entries for select to backup_collision_reader using (true);

grant insert (id,organization_id,branch_id,supplier_id,purchase_id,payment_id,entry_type,direction,amount,balance_after,description,reference_number,created_by,created_at,updated_at) on public.supplier_ledger_entries to backup_import_executor;
create policy backup_snapshot_insert on public.supplier_ledger_entries for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.supplier_ledger_entries to backup_collision_reader;
create policy backup_native_collision on public.supplier_ledger_entries for select to backup_collision_reader using (true);

grant insert (id,organization_id,invoice_id,invoice_item_id,product_id,stock_lot_id,quantity,unit_cost,created_at) on public.invoice_item_stock_allocations to backup_import_executor;
create policy backup_snapshot_insert on public.invoice_item_stock_allocations for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.invoice_item_stock_allocations to backup_collision_reader;
create policy backup_native_collision on public.invoice_item_stock_allocations for select to backup_collision_reader using (true);

grant insert (id,organization_id,branch_id,product_id,stock_lot_id,movement_type,quantity,unit_cost,reference_type,reference_id,invoice_id,invoice_item_id,notes,created_by,created_at) on public.stock_movements to backup_import_executor;
create policy backup_snapshot_insert on public.stock_movements for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.stock_movements to backup_collision_reader;
create policy backup_native_collision on public.stock_movements for select to backup_collision_reader using (true);

grant insert (id,organization_id,purchase_id,product_id,product_name,quantity,unit_cost,line_total,stock_lot_id,notes,created_at) on public.supplier_purchase_items to backup_import_executor;
create policy backup_snapshot_insert on public.supplier_purchase_items for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.supplier_purchase_items to backup_collision_reader;
create policy backup_native_collision on public.supplier_purchase_items for select to backup_collision_reader using (true);

grant insert (id,organization_id,return_id,invoice_id,invoice_item_id,product_id,item_name,item_type,quantity,unit_price,line_total,restock,created_at) on public.return_items to backup_import_executor;
create policy backup_snapshot_insert on public.return_items for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.return_items to backup_collision_reader;
create policy backup_native_collision on public.return_items for select to backup_collision_reader using (true);

grant insert (id,organization_id,return_id,return_item_id,product_id,stock_lot_id,quantity,unit_cost,created_at) on public.return_stock_allocations to backup_import_executor;
create policy backup_snapshot_insert on public.return_stock_allocations for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));
grant select (id) on public.return_stock_allocations to backup_collision_reader;
create policy backup_native_collision on public.return_stock_allocations for select to backup_collision_reader using (true);

grant select (organization_id,name,phone,email) on public.customers to backup_collision_reader;
grant select (organization_id,name) on public.suppliers to backup_collision_reader;
grant select (organization_id,name) on public.product_categories to backup_collision_reader;
grant select (organization_id,barcode) on public.products to backup_collision_reader;
grant select (organization_id,invoice_no,checkout_idempotency_key) on public.invoices to backup_collision_reader;
grant select (organization_id,return_no) on public.returns to backup_collision_reader;
grant select (organization_id,purchase_no) on public.supplier_purchases to backup_collision_reader;
grant select on backup_private.staged_rows to backup_collision_reader;
create policy backup_probe_staging on backup_private.staged_rows for select to backup_collision_reader
using (job_id in (select id from backup_private.jobs where organization_id=backup_private.owner_org() and created_by=backup_private.actor_id()));
grant select (id,organization_id,created_by) on backup_private.jobs to backup_collision_reader;
create policy backup_probe_jobs on backup_private.jobs for select to backup_collision_reader
using (organization_id=backup_private.owner_org() and created_by=backup_private.actor_id());

create function backup_private.check_collisions(p_job uuid) returns void
language plpgsql security definer set search_path='' as $$
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

end; $$;
alter function backup_private.check_collisions(uuid) owner to backup_collision_reader;
revoke all on function backup_private.check_collisions(uuid) from public,anon,authenticated;
grant execute on function backup_private.check_collisions(uuid) to backup_import_executor;

grant select (id,organization_id) on public.branches to backup_import_executor;
create policy backup_branch_read on public.branches for select to backup_import_executor
using (organization_id=(select backup_private.owner_org()));
grant select (id) on public.organizations to backup_import_executor;
create policy backup_organization_read on public.organizations for select to backup_import_executor
using (id=(select backup_private.owner_org()));
grant execute on function public.current_organization_id() to backup_import_executor;
alter policy backup_owner_profile_read on public.profiles
using (organization_id=(select public.current_organization_id()));

create function backup_private.check_references(p_job uuid) returns void
language plpgsql set search_path='' as $$
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

end; $$;
alter function backup_private.check_references(uuid) owner to backup_import_executor;
revoke all on function backup_private.check_references(uuid) from public,anon,authenticated;

create function backup_private.insert_snapshot(p_job uuid) returns void
language plpgsql set search_path='' as $$
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

  insert into public.returns(id,organization_id,branch_id,invoice_id,customer_id,return_no,status,subtotal,refund_amount,refund_method,reference_number,notes,created_by,created_at,updated_at)
    select r.id,r.organization_id,r.branch_id,r.invoice_id,r.customer_id,r.return_no,r.status,r.subtotal,r.refund_amount,r.refund_method,r.reference_number,r.notes,r.created_by,r.created_at,r.updated_at from backup_private.staged_rows s
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

  insert into public.return_items(id,organization_id,return_id,invoice_id,invoice_item_id,product_id,item_name,item_type,quantity,unit_price,line_total,restock,created_at)
    select r.id,r.organization_id,r.return_id,r.invoice_id,r.invoice_item_id,r.product_id,r.item_name,r.item_type,r.quantity,r.unit_price,r.line_total,r.restock,r.created_at from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.return_items,s.payload) r
    where s.job_id=p_job and s.table_name='return_items' order by s.target_id;

  insert into public.return_stock_allocations(id,organization_id,return_id,return_item_id,product_id,stock_lot_id,quantity,unit_cost,created_at)
    select r.id,r.organization_id,r.return_id,r.return_item_id,r.product_id,r.stock_lot_id,r.quantity,r.unit_cost,r.created_at from backup_private.staged_rows s
    cross join lateral jsonb_populate_record(null::public.return_stock_allocations,s.payload) r
    where s.job_id=p_job and s.table_name='return_stock_allocations' order by s.target_id;

end; $$;
alter function backup_private.insert_snapshot(uuid) owner to backup_import_executor;
revoke all on function backup_private.insert_snapshot(uuid) from public,anon,authenticated;

create function backup_private.stage_chunk(p_job uuid,p_table text,p_index integer,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare
  j backup_private.jobs := backup_private.owned_job(p_job);
  c backup_private.chunks; v_rows jsonb; v_count integer; v_bytes bigint;
  v_transport text; v_digest text;
begin
  if p_table is null or not p_table=any(backup_private.core_tables()) or p_index is null or p_index<0
    or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 then
    raise exception 'Invalid restore chunk.' using errcode='22023'; end if;
  if octet_length(jsonb_build_object('p_job',p_job,'p_table',p_table,'p_index',p_index,'p_rows',p_rows)::text)>1048576 then
    raise exception 'Restore request exceeds the safe upload size.' using errcode='22023'; end if;
  select * into j from backup_private.jobs where id=p_job for update;
  if j.state<>'staging' or j.expires_at<=clock_timestamp() then
    raise exception 'This restore job no longer accepts uploads.' using errcode='55000'; end if;
  v_transport:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
  select * into c from backup_private.chunks where job_id=p_job and table_name=p_table and chunk_index=p_index;
  if found then
    if c.transport_digest<>v_transport then raise exception 'Chunk retry differs from accepted data.' using errcode='23505'; end if;
    return jsonb_build_object('ok',true,'replayed',true,'rows',c.row_count,'bytes',c.normalized_bytes,'digest',c.content_digest);
  end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r) is distinct from 'object'
    or jsonb_typeof(r->'source_id') is distinct from 'string' or length(r->>'source_id') not between 1 and 256
    or (select count(*) from jsonb_object_keys(r))<>2 or not r ? 'payload') then
    raise exception 'Invalid source identity or row envelope.' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('source_id',r->>'source_id','ordinal',n,
    'payload',backup_private.normalize_row(p_table,r->'payload',j.organization_id,j.created_at)) order by n)
    into v_rows from jsonb_array_elements(p_rows) with ordinality a(r,n);
  select count(*),sum(octet_length((r->'payload')::text)),
    encode(sha256(convert_to(string_agg((r->'payload')::text,E'\n' order by (r->>'ordinal')::integer),'UTF8')),'hex')
    into v_count,v_bytes,v_digest from jsonb_array_elements(v_rows) r;
  if j.row_count+v_count>50000 or j.normalized_bytes+v_bytes>33554432 then
    update backup_private.jobs set state='ineligible',last_error='Automatic safe-restore limit exceeded.' where id=p_job;
    return jsonb_build_object('ok',false,'state','ineligible','message',
      'This backup may be valid, but it exceeds the automatic safe-restore limit. No shop data changed.');
  end if;
  insert into backup_private.chunks values(p_job,p_table,p_index,v_transport,v_digest,v_count,v_bytes);
  insert into backup_private.staged_rows(job_id,table_name,chunk_index,ordinal,source_id,target_id,payload,content_digest)
    select p_job,p_table,p_index,(r->>'ordinal')::integer,r->>'source_id',(r->'payload'->>'id')::uuid,r->'payload',
      encode(sha256(convert_to((r->'payload')::text,'UTF8')),'hex') from jsonb_array_elements(v_rows) r;
  update backup_private.jobs set row_count=row_count+v_count,normalized_bytes=normalized_bytes+v_bytes,
    chunk_count=chunk_count+1 where id=p_job;
  return jsonb_build_object('ok',true,'replayed',false,'rows',v_count,'bytes',v_bytes,'digest',v_digest);
end; $$;
alter function backup_private.stage_chunk(uuid,text,integer,jsonb) owner to backup_import_executor;
revoke all on function backup_private.stage_chunk(uuid,text,integer,jsonb) from public,anon,authenticated;

create function backup_private.manifest(p_job uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_object_agg(t,jsonb_build_object('rows',coalesce(c.rows,0),'chunks',coalesce(c.chunks,0),'bytes',coalesce(c.bytes,0)))
  from unnest(backup_private.core_tables()) t left join (
    select table_name,sum(row_count) rows,count(*) chunks,sum(normalized_bytes) bytes
    from backup_private.chunks where job_id=p_job group by table_name
  ) c on c.table_name=t
$$;
alter function backup_private.manifest(uuid) owner to backup_import_executor;
revoke all on function backup_private.manifest(uuid) from public,anon,authenticated;

create function backup_private.seal_hash(p_job uuid) returns text
language sql stable set search_path='' as $$
  select encode(sha256(convert_to(jsonb_build_object('job',j.id,'epoch',j.epoch,'org',j.organization_id,
    'rows',j.row_count,'bytes',j.normalized_bytes,'manifest',backup_private.manifest(p_job),
    'chunks',coalesce((select jsonb_agg(jsonb_build_array(table_name,chunk_index,content_digest)
      order by table_name,chunk_index) from backup_private.chunks where job_id=p_job),'[]'::jsonb))::text,'UTF8')),'hex')
  from backup_private.jobs j where j.id=p_job
$$;
alter function backup_private.seal_hash(uuid) owner to backup_import_executor;
revoke all on function backup_private.seal_hash(uuid) from public,anon,authenticated;

create function backup_private.verify_seal(p_job uuid) returns void
language plpgsql set search_path='' as $$
declare j backup_private.jobs; v_rows bigint; v_bytes bigint; v_bad boolean;
begin
  select * into strict j from backup_private.jobs where id=p_job;
  select count(*),coalesce(sum(octet_length(payload::text)),0),coalesce(bool_or(content_digest<>
    encode(sha256(convert_to(payload::text,'UTF8')),'hex')),false)
    into v_rows,v_bytes,v_bad from backup_private.staged_rows where job_id=p_job;
  if j.state not in ('sealed','ready') or j.expires_at<=clock_timestamp() or v_bad
    or j.row_count<>v_rows or j.normalized_bytes<>v_bytes or v_rows>50000 or v_bytes>33554432
    or j.seal_digest is distinct from backup_private.seal_hash(p_job)
    or j.declared_manifest is distinct from backup_private.manifest(p_job) then
    raise exception 'Restore seal or eligibility is invalid.' using errcode='55000'; end if;
  if exists(select 1 from backup_private.chunks c left join (
    select table_name,chunk_index,count(*) rows,sum(octet_length(payload::text)) bytes,
      encode(sha256(convert_to(string_agg(payload::text,E'\n' order by ordinal),'UTF8')),'hex') digest
    from backup_private.staged_rows where job_id=p_job group by table_name,chunk_index
  ) r on r.table_name=c.table_name and r.chunk_index=c.chunk_index
    where c.job_id=p_job and (r.rows is distinct from c.row_count or r.bytes is distinct from c.normalized_bytes
      or r.digest is distinct from c.content_digest)) then
    raise exception 'Restore chunk integrity check failed.' using errcode='55000'; end if;
end; $$;
alter function backup_private.verify_seal(uuid) owner to backup_import_executor;
revoke all on function backup_private.verify_seal(uuid) from public,anon,authenticated;

create function backup_private.seal_job(p_job uuid,p_manifest jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j backup_private.jobs := backup_private.owned_job(p_job);
begin
  select * into j from backup_private.jobs where id=p_job for update;
  if j.state='sealed' and j.declared_manifest=p_manifest then
    return jsonb_build_object('ok',true,'state',j.state,'digest',j.seal_digest); end if;
  if j.state<>'staging' or j.expires_at<=clock_timestamp()
    or p_manifest is distinct from backup_private.manifest(p_job) then
    raise exception 'Backup upload is incomplete or its manifest differs.' using errcode='22023'; end if;
  if exists(select 1 from backup_private.chunks where job_id=p_job group by table_name
    having min(chunk_index)<>0 or max(chunk_index)<>count(*)-1) then
    raise exception 'Backup chunk sequence is incomplete.' using errcode='22023'; end if;
  update backup_private.jobs set state='sealed',declared_manifest=p_manifest,
    seal_digest=backup_private.seal_hash(p_job) where id=p_job returning * into j;
  -- Uploads change the distribution sharply; validation needs current private-table statistics.
  analyze backup_private.staged_rows;
  analyze backup_private.jobs;
  return jsonb_build_object('ok',true,'state',j.state,'digest',j.seal_digest);
end; $$;
alter function backup_private.seal_job(uuid,jsonb) owner to backup_import_executor;
revoke all on function backup_private.seal_job(uuid,jsonb) from public,anon,authenticated;

create function backup_private.validate_job(p_job uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j backup_private.jobs := backup_private.owned_job(p_job); v_error text;
begin
  select * into j from backup_private.jobs where id=p_job for update;
  if j.state not in ('sealed','ready') then raise exception 'Seal the backup before validation.' using errcode='55000'; end if;
  begin
    perform backup_private.verify_seal(p_job);
    if j.epoch is distinct from (select epoch from backup_private.organization_identity_locks where organization_id=j.organization_id) then
      raise exception 'Factory Reset invalidated this backup upload.' using errcode='55000'; end if;
    perform backup_private.check_references(p_job);
    perform backup_private.check_collisions(p_job);
  exception when sqlstate '22023' or sqlstate '23503' or sqlstate '23505' or sqlstate '55000' then
    get stacked diagnostics v_error=message_text;
    update backup_private.jobs set state='validation_failed',last_error=v_error where id=p_job;
    return jsonb_build_object('ok',false,'state','validation_failed','message',v_error);
  end;
  update backup_private.jobs set state='ready' where id=p_job;
  return jsonb_build_object('ok',true,'state','ready','rows',j.row_count,'bytes',j.normalized_bytes);
end; $$;
alter function backup_private.validate_job(uuid) owner to backup_import_executor;
revoke all on function backup_private.validate_job(uuid) from public,anon,authenticated;

-- Internal row-lock capability only, never granted to application roles.
grant update(id) on public.profiles,public.branches,public.organizations to backup_import_executor;
create policy backup_profile_lock on public.profiles for update to backup_import_executor
using (organization_id=(select public.current_organization_id())) with check (false);
create policy backup_branch_lock on public.branches for update to backup_import_executor
using (organization_id=(select backup_private.owner_org())) with check (false);
create policy backup_organization_lock on public.organizations for update to backup_import_executor
using (id=(select backup_private.owner_org())) with check (false);

create function backup_private.finalize_job(p_job uuid,p_digest text) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='250ms' as $$
declare
  v_started timestamptz:=clock_timestamp(); v_locked timestamptz;
  j backup_private.jobs:=backup_private.owned_job(p_job); v_epoch bigint;
  r backup_private.receipts; v_counts jsonb;
begin
  -- One lock order: organization mutex, job, then roots and dependent work.
  v_epoch:=backup_private.lock_identity(j.organization_id);
  v_locked:=clock_timestamp();
  select * into j from backup_private.jobs where id=p_job for update;
  if j.epoch<>v_epoch then raise exception 'Factory Reset invalidated this backup upload.' using errcode='55000'; end if;
  if j.seal_digest is distinct from p_digest then raise exception 'Restore digest does not match.' using errcode='22023'; end if;
  select * into r from backup_private.receipts where job_id=p_job;
  if found then return jsonb_build_object('ok',true,'replayed',true,'state',j.state,'receipt',to_jsonb(r)); end if;
  if j.state<>'ready' then raise exception 'Backup must pass validation before restoring.' using errcode='55000'; end if;
  perform 1 from public.organizations where id=j.organization_id for key share;
  perform 1 from public.profiles where id=backup_private.actor_id() for share;
  perform 1 from public.branches b where b.organization_id=j.organization_id and b.id in (
    select (payload->>'branch_id')::uuid from backup_private.staged_rows where job_id=p_job
      and payload->>'branch_id' is not null) order by b.id for share;
  perform 1 from public.profiles p where p.organization_id=j.organization_id and p.id in (
    select value::uuid from backup_private.staged_rows s cross join lateral unnest(array[
      s.payload->>'created_by',s.payload->>'received_by',s.payload->>'written_by',s.payload->>'sell_at_loss_updated_by'
    ]) f(value) where s.job_id=p_job and value is not null
  ) order by p.id for share;
  if backup_private.owner_org()<>j.organization_id then raise exception 'Owner authorization changed.' using errcode='42501'; end if;
  perform backup_private.verify_seal(p_job);
  perform backup_private.check_references(p_job);
  perform backup_private.check_collisions(p_job);
  perform backup_private.insert_snapshot(p_job);
  insert into backup_private.mappings(job_id,table_name,source_id,target_id)
    select job_id,table_name,source_id,target_id from backup_private.staged_rows where job_id=p_job;
  select jsonb_object_agg(t,coalesce(c.n,0)) into v_counts from unnest(backup_private.core_tables()) t
    left join (select table_name,count(*) n from backup_private.staged_rows where job_id=p_job group by table_name) c on c.table_name=t;
  insert into backup_private.receipts(job_id,organization_id,seal_digest,epoch,counts,transaction_ms,identity_ms)
    values(p_job,j.organization_id,j.seal_digest,j.epoch,v_counts,
      extract(epoch from clock_timestamp()-v_started)*1000,extract(epoch from clock_timestamp()-v_locked)*1000)
    returning * into r;
  update backup_private.jobs set state='accounting_completed' where id=p_job;
  return jsonb_build_object('ok',true,'replayed',false,'state','accounting_completed','receipt',to_jsonb(r));
end; $$;
alter function backup_private.finalize_job(uuid,text) owner to backup_import_executor;
revoke all on function backup_private.finalize_job(uuid,text) from public,anon,authenticated;

create function backup_private.get_job(p_job uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j backup_private.jobs:=backup_private.owned_job(p_job);
begin
  if j.expires_at<=clock_timestamp() then
    select * into j from backup_private.jobs where id=p_job for update;
    if j.state in ('staging','sealed','ready') then
      update backup_private.jobs set state='expired' where id=p_job returning * into j;
    end if;
    -- Expired payload is disposable. Receipts, mappings and the sealed manifest remain.
    delete from backup_private.chunks where job_id=p_job;
  end if;
  return jsonb_build_object('ok',true,'job_id',j.id,'state',j.state,'rows',j.row_count,'bytes',j.normalized_bytes,
    'digest',j.seal_digest,'manifest',coalesce(j.declared_manifest,backup_private.manifest(p_job)),'message',j.last_error,
    'receipt',(select to_jsonb(r) from backup_private.receipts r where job_id=p_job));
end; $$;
alter function backup_private.get_job(uuid) owner to backup_import_executor;
revoke all on function backup_private.get_job(uuid) from public,anon,authenticated;

create function backup_private.cancel_job(p_job uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j backup_private.jobs:=backup_private.owned_job(p_job);
begin
  select * into j from backup_private.jobs where id=p_job for update;
  if exists(select 1 from backup_private.receipts where job_id=p_job) then
    raise exception 'Committed accounting data cannot be cancelled.' using errcode='55000'; end if;
  update backup_private.jobs set state='cancelled' where id=p_job;
  delete from backup_private.chunks where job_id=p_job;
  return jsonb_build_object('ok',true,'state','cancelled');
end; $$;
alter function backup_private.cancel_job(uuid) owner to backup_import_executor;
revoke all on function backup_private.cancel_job(uuid) from public,anon,authenticated;

-- Ancillary writes are separately committed, never part of the core receipt.
create table backup_private.ancillary_chunks (
  job_id uuid not null references backup_private.jobs(id) on delete cascade,
  table_name text not null,
  chunk_index integer not null check(chunk_index>=0),
  digest text not null,
  row_count integer not null check(row_count>0),
  primary key(job_id,table_name,chunk_index)
);
alter table backup_private.ancillary_chunks owner to backup_import_executor;
alter table backup_private.ancillary_chunks enable row level security;
revoke all on backup_private.ancillary_chunks from public,anon,authenticated;

grant insert (id,organization_id,branch_id,opened_at,closed_at,opened_by,closed_by,starting_cash,expected_cash,counted_cash,cash_difference,notes,status,created_at,updated_at) on public.cash_shifts to backup_import_executor;
create policy backup_ancillary_insert on public.cash_shifts for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));

grant insert (id,organization_id,branch_id,category,amount,payment_method,vendor_name,notes,status,spent_at,created_by,archived_at,archived_by,created_at,updated_at) on public.expenses to backup_import_executor;
create policy backup_ancillary_insert on public.expenses for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));

grant insert (id,organization_id,branch_id,customer_id,job_no,customer_name,customer_phone,device_type,device_model,serial_imei,problem_description,diagnosis,estimated_cost,advance_paid,final_cost,status,expected_delivery_at,delivered_at,notes,created_by,created_at,updated_at,accessories_received,payment_method) on public.repairs to backup_import_executor;
create policy backup_ancillary_insert on public.repairs for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));

grant insert (id,organization_id,branch_id,closing_date,bills_count,cash_sales,digital_payments,credit_pending,expenses_total,refunds_total,service_commission_earned,service_cash_in,service_cash_out,expected_closing_cash,actual_closing_cash,cash_difference,notes,finalized_by,created_at,updated_at,finalized_at,credit_collection_cash,credit_collection_digital,credit_write_offs) on public.daily_closings to backup_import_executor;
create policy backup_ancillary_insert on public.daily_closings for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));

grant insert (id,organization_id,profile_id,can_sell,can_discount,can_return,can_void_invoice,can_view_reports,can_manage_stock,can_sell_at_loss,can_change_settings,created_at,updated_at) on public.staff_permissions to backup_import_executor;
create policy backup_ancillary_insert on public.staff_permissions for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));

grant insert (id,organization_id,branch_id,product_id,invoice_id,actor_id,event_type,reason,cost_amount,effective_sale_amount,loss_amount,metadata,created_at) on public.loss_prevention_events to backup_import_executor;
create policy backup_ancillary_insert on public.loss_prevention_events for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));

grant insert (id,organization_id,branch_id,actor_id,module,action,details,metadata,created_at) on public.audit_logs to backup_import_executor;
create policy backup_ancillary_insert on public.audit_logs for insert to backup_import_executor
with check (organization_id=(select backup_private.owner_org()));

create function backup_private.restore_ancillary(p_job uuid,p_table text,p_index integer,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='250ms' as $$
declare j backup_private.jobs:=backup_private.owned_job(p_job); v_epoch bigint;
  v_rows jsonb; v_digest text; v_count integer; v_expected integer; v_done integer; v_error text;
begin
  v_epoch:=backup_private.lock_identity(j.organization_id);
  select * into j from backup_private.jobs where id=p_job for update;
  if j.epoch<>v_epoch then raise exception 'Factory Reset invalidated this backup upload.' using errcode='55000'; end if;
  if j.state not in ('accounting_completed','ancillary_pending','ancillary_failed','completed') or
    not exists(select 1 from backup_private.receipts where job_id=p_job) then
    raise exception 'Accounting restore must commit before remaining data.' using errcode='55000'; end if;
  if p_table <> all(array['cash_shifts','expenses','repairs','daily_closings','staff_permissions','loss_prevention_events','audit_logs']) or p_index is null or p_index<0 or
    jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 or
    octet_length(jsonb_build_object('p_job',p_job,'p_table',p_table,'p_index',p_index,'p_rows',p_rows)::text)>1048576 then
    raise exception 'Invalid or oversized remaining-data chunk.' using errcode='22023'; end if;
  v_digest:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
  if exists(select 1 from backup_private.ancillary_chunks where job_id=p_job and table_name=p_table and chunk_index=p_index) then
    if not exists(select 1 from backup_private.ancillary_chunks where job_id=p_job and table_name=p_table and chunk_index=p_index and digest=v_digest) then
      raise exception 'Remaining-data chunk changed after upload.' using errcode='23505'; end if;
    return jsonb_build_object('ok',true,'replayed',true,'state',j.state);
  end if;
  if j.state='completed' then raise exception 'Restore already completed.' using errcode='55000'; end if;
  begin
    v_expected:=coalesce((j.ancillary_manifest->>p_table)::integer,0);
    v_count:=jsonb_array_length(p_rows);
    select coalesce(sum(row_count),0) into v_done from backup_private.ancillary_chunks where job_id=p_job and table_name=p_table;
    if v_done+v_count>v_expected or p_index<>(select count(*) from backup_private.ancillary_chunks where job_id=p_job and table_name=p_table) then
      raise exception 'Remaining-data counts do not match the manifest.' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(p_rows) e where jsonb_typeof(e) is distinct from 'object' or
      e->>'source_id' is null or length(e->>'source_id') not between 1 and 256 or
      jsonb_typeof(e->'payload') is distinct from 'object' or
      exists(select 1 from jsonb_object_keys(e) k where k<>all(array['source_id','payload']))) then
      raise exception 'Invalid remaining-data row.' using errcode='22023'; end if;
    select jsonb_agg(backup_private.normalize_row(p_table,e->'payload',j.organization_id,j.created_at))
      into v_rows from jsonb_array_elements(p_rows) e;
    -- The existing audit trigger creates a companion event. Never replay it as a snapshot.
    if p_table='audit_logs' and exists(select 1 from jsonb_array_elements(v_rows) e
      where e->>'module'='pos' and e->>'action'='pos.loss_sale_completed') then
      raise exception 'Loss-sale audit snapshots cannot be restored without duplicating their generated events. Accounting data is saved; optional audit restore is incomplete.' using errcode='22023'; end if;
  if p_table='cash_shifts' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'branch_id' is not null and not exists(select 1 from public.branches p
      where p.id=(e->>'branch_id')::uuid and p.organization_id=j.organization_id)) then
    raise exception 'Unresolved cash_shifts.branch_id reference.' using errcode='23503'; end if;
  if p_table='cash_shifts' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'closed_by' is not null and not exists(select 1 from public.profiles p
      where p.id=(e->>'closed_by')::uuid and p.organization_id=j.organization_id)) then
    raise exception 'Unresolved cash_shifts.closed_by reference.' using errcode='23503'; end if;
  if p_table='cash_shifts' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'opened_by' is not null and not exists(select 1 from public.profiles p
      where p.id=(e->>'opened_by')::uuid and p.organization_id=j.organization_id)) then
    raise exception 'Unresolved cash_shifts.opened_by reference.' using errcode='23503'; end if;
  if p_table='expenses' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'archived_by' is not null and not exists(select 1 from public.profiles p
      where p.id=(e->>'archived_by')::uuid and p.organization_id=j.organization_id)) then
    raise exception 'Unresolved expenses.archived_by reference.' using errcode='23503'; end if;
  if p_table='expenses' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'branch_id' is not null and not exists(select 1 from public.branches p
      where p.id=(e->>'branch_id')::uuid and p.organization_id=j.organization_id)) then
    raise exception 'Unresolved expenses.branch_id reference.' using errcode='23503'; end if;
  if p_table='expenses' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'created_by' is not null and not exists(select 1 from public.profiles p
      where p.id=(e->>'created_by')::uuid and p.organization_id=j.organization_id)) then
    raise exception 'Unresolved expenses.created_by reference.' using errcode='23503'; end if;
  if p_table='repairs' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'branch_id' is not null and not exists(select 1 from public.branches p
      where p.id=(e->>'branch_id')::uuid and p.organization_id=j.organization_id)) then
    raise exception 'Unresolved repairs.branch_id reference.' using errcode='23503'; end if;
  if p_table='repairs' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'created_by' is not null and not exists(select 1 from public.profiles p
      where p.id=(e->>'created_by')::uuid and p.organization_id=j.organization_id)) then
    raise exception 'Unresolved repairs.created_by reference.' using errcode='23503'; end if;
  if p_table='repairs' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'customer_id' is not null and not exists(select 1 from backup_private.mappings m
      where m.job_id=p_job and m.table_name='customers' and m.target_id=(e->>'customer_id')::uuid)) then
    raise exception 'Unresolved repairs.customer_id reference.' using errcode='23503'; end if;
  if p_table='daily_closings' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'branch_id' is not null and not exists(select 1 from public.branches p
      where p.id=(e->>'branch_id')::uuid and p.organization_id=j.organization_id)) then
    raise exception 'Unresolved daily_closings.branch_id reference.' using errcode='23503'; end if;
  if p_table='daily_closings' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'finalized_by' is not null and not exists(select 1 from public.profiles p
      where p.id=(e->>'finalized_by')::uuid and p.organization_id=j.organization_id)) then
    raise exception 'Unresolved daily_closings.finalized_by reference.' using errcode='23503'; end if;
  if p_table='staff_permissions' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'profile_id' is not null and not exists(select 1 from public.profiles p
      where p.id=(e->>'profile_id')::uuid and p.organization_id=j.organization_id)) then
    raise exception 'Unresolved staff_permissions.profile_id reference.' using errcode='23503'; end if;
  if p_table='loss_prevention_events' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'actor_id' is not null and not exists(select 1 from public.profiles p
      where p.id=(e->>'actor_id')::uuid and p.organization_id=j.organization_id)) then
    raise exception 'Unresolved loss_prevention_events.actor_id reference.' using errcode='23503'; end if;
  if p_table='loss_prevention_events' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'branch_id' is not null and not exists(select 1 from public.branches p
      where p.id=(e->>'branch_id')::uuid and p.organization_id=j.organization_id)) then
    raise exception 'Unresolved loss_prevention_events.branch_id reference.' using errcode='23503'; end if;
  if p_table='loss_prevention_events' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'invoice_id' is not null and not exists(select 1 from backup_private.mappings m
      where m.job_id=p_job and m.table_name='invoices' and m.target_id=(e->>'invoice_id')::uuid)) then
    raise exception 'Unresolved loss_prevention_events.invoice_id reference.' using errcode='23503'; end if;
  if p_table='loss_prevention_events' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'product_id' is not null and not exists(select 1 from backup_private.mappings m
      where m.job_id=p_job and m.table_name='products' and m.target_id=(e->>'product_id')::uuid)) then
    raise exception 'Unresolved loss_prevention_events.product_id reference.' using errcode='23503'; end if;
  if p_table='audit_logs' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'actor_id' is not null and not exists(select 1 from public.profiles p
      where p.id=(e->>'actor_id')::uuid and p.organization_id=j.organization_id)) then
    raise exception 'Unresolved audit_logs.actor_id reference.' using errcode='23503'; end if;
  if p_table='audit_logs' and exists(select 1 from jsonb_array_elements(v_rows) e
    where e->>'branch_id' is not null and not exists(select 1 from public.branches p
      where p.id=(e->>'branch_id')::uuid and p.organization_id=j.organization_id)) then
    raise exception 'Unresolved audit_logs.branch_id reference.' using errcode='23503'; end if;
    case p_table
    when 'cash_shifts' then
      insert into public.cash_shifts(id,organization_id,branch_id,opened_at,closed_at,opened_by,closed_by,starting_cash,expected_cash,counted_cash,cash_difference,notes,status,created_at,updated_at)
      select r.id,r.organization_id,r.branch_id,r.opened_at,r.closed_at,r.opened_by,r.closed_by,r.starting_cash,r.expected_cash,r.counted_cash,r.cash_difference,r.notes,r.status,r.created_at,r.updated_at from jsonb_array_elements(v_rows) e
      cross join lateral jsonb_populate_record(null::public.cash_shifts,e) r;
    when 'expenses' then
      insert into public.expenses(id,organization_id,branch_id,category,amount,payment_method,vendor_name,notes,status,spent_at,created_by,archived_at,archived_by,created_at,updated_at)
      select r.id,r.organization_id,r.branch_id,r.category,r.amount,r.payment_method,r.vendor_name,r.notes,r.status,r.spent_at,r.created_by,r.archived_at,r.archived_by,r.created_at,r.updated_at from jsonb_array_elements(v_rows) e
      cross join lateral jsonb_populate_record(null::public.expenses,e) r;
    when 'repairs' then
      insert into public.repairs(id,organization_id,branch_id,customer_id,job_no,customer_name,customer_phone,device_type,device_model,serial_imei,problem_description,diagnosis,estimated_cost,advance_paid,final_cost,status,expected_delivery_at,delivered_at,notes,created_by,created_at,updated_at,accessories_received,payment_method)
      select r.id,r.organization_id,r.branch_id,r.customer_id,r.job_no,r.customer_name,r.customer_phone,r.device_type,r.device_model,r.serial_imei,r.problem_description,r.diagnosis,r.estimated_cost,r.advance_paid,r.final_cost,r.status,r.expected_delivery_at,r.delivered_at,r.notes,r.created_by,r.created_at,r.updated_at,r.accessories_received,r.payment_method from jsonb_array_elements(v_rows) e
      cross join lateral jsonb_populate_record(null::public.repairs,e) r;
    when 'daily_closings' then
      insert into public.daily_closings(id,organization_id,branch_id,closing_date,bills_count,cash_sales,digital_payments,credit_pending,expenses_total,refunds_total,service_commission_earned,service_cash_in,service_cash_out,expected_closing_cash,actual_closing_cash,cash_difference,notes,finalized_by,created_at,updated_at,finalized_at,credit_collection_cash,credit_collection_digital,credit_write_offs)
      select r.id,r.organization_id,r.branch_id,r.closing_date,r.bills_count,r.cash_sales,r.digital_payments,r.credit_pending,r.expenses_total,r.refunds_total,r.service_commission_earned,r.service_cash_in,r.service_cash_out,r.expected_closing_cash,r.actual_closing_cash,r.cash_difference,r.notes,r.finalized_by,r.created_at,r.updated_at,r.finalized_at,r.credit_collection_cash,r.credit_collection_digital,r.credit_write_offs from jsonb_array_elements(v_rows) e
      cross join lateral jsonb_populate_record(null::public.daily_closings,e) r;
    when 'staff_permissions' then
      insert into public.staff_permissions(id,organization_id,profile_id,can_sell,can_discount,can_return,can_void_invoice,can_view_reports,can_manage_stock,can_sell_at_loss,can_change_settings,created_at,updated_at)
      select r.id,r.organization_id,r.profile_id,r.can_sell,r.can_discount,r.can_return,r.can_void_invoice,r.can_view_reports,r.can_manage_stock,r.can_sell_at_loss,r.can_change_settings,r.created_at,r.updated_at from jsonb_array_elements(v_rows) e
      cross join lateral jsonb_populate_record(null::public.staff_permissions,e) r;
    when 'loss_prevention_events' then
      insert into public.loss_prevention_events(id,organization_id,branch_id,product_id,invoice_id,actor_id,event_type,reason,cost_amount,effective_sale_amount,loss_amount,metadata,created_at)
      select r.id,r.organization_id,r.branch_id,r.product_id,r.invoice_id,r.actor_id,r.event_type,r.reason,r.cost_amount,r.effective_sale_amount,r.loss_amount,r.metadata,r.created_at from jsonb_array_elements(v_rows) e
      cross join lateral jsonb_populate_record(null::public.loss_prevention_events,e) r;
    when 'audit_logs' then
      insert into public.audit_logs(id,organization_id,branch_id,actor_id,module,action,details,metadata,created_at)
      select r.id,r.organization_id,r.branch_id,r.actor_id,r.module,r.action,r.details,r.metadata,r.created_at from jsonb_array_elements(v_rows) e
      cross join lateral jsonb_populate_record(null::public.audit_logs,e) r;
    end case;
    insert into backup_private.ancillary_chunks values(p_job,p_table,p_index,v_digest,v_count);
    update backup_private.jobs set state='ancillary_pending',last_error=null where id=p_job;
    return jsonb_build_object('ok',true,'replayed',false,'state','ancillary_pending','inserted',v_count);
  exception when others then
    get stacked diagnostics v_error=message_text;
    -- Only this chunk rolls back. Never compensate-delete committed accounting data.
    update backup_private.jobs set state='ancillary_failed',last_error='Remaining data failed validation or insertion. Accounting data remains saved.' where id=p_job;
    return jsonb_build_object('ok',false,'state','ancillary_failed','message',
      case when sqlstate='22023' then v_error else 'Remaining data failed validation or insertion. Accounting data remains saved.' end);
  end;
end; $$;
alter function backup_private.restore_ancillary(uuid,text,integer,jsonb) owner to backup_import_executor;
revoke all on function backup_private.restore_ancillary(uuid,text,integer,jsonb) from public,anon,authenticated;

create function backup_private.finish_job(p_job uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j backup_private.jobs:=backup_private.owned_job(p_job); v_epoch bigint;
begin
  v_epoch:=backup_private.lock_identity(j.organization_id);
  select * into j from backup_private.jobs where id=p_job for update;
  if j.epoch<>v_epoch or not exists(select 1 from backup_private.receipts where job_id=p_job) then
    raise exception 'Accounting restore receipt is unavailable.' using errcode='55000'; end if;
  if exists(select 1 from jsonb_each_text(j.ancillary_manifest) m where m.value::integer <>
    (select coalesce(sum(c.row_count),0) from backup_private.ancillary_chunks c where c.job_id=p_job and c.table_name=m.key)) then
    update backup_private.jobs set state='ancillary_failed',last_error='Remaining data is incomplete. Accounting data remains saved.' where id=p_job;
    return jsonb_build_object('ok',false,'state','ancillary_failed','message','Remaining data is incomplete. Accounting data remains saved.');
  end if;
  update backup_private.jobs set state='completed',last_error=null where id=p_job;
  return jsonb_build_object('ok',true,'state','completed');
end; $$;
alter function backup_private.finish_job(uuid) owner to backup_import_executor;
revoke all on function backup_private.finish_job(uuid) from public,anon,authenticated;

create function public.accounting_import_restore_ancillary(p_job uuid,p_table text,p_index integer,p_rows jsonb) returns jsonb
language sql security invoker set search_path=''
begin atomic
  select backup_private.restore_ancillary(p_job,p_table,p_index,p_rows);
end;
revoke all on function public.accounting_import_restore_ancillary(uuid,text,integer,jsonb) from public,anon;
grant execute on function public.accounting_import_restore_ancillary(uuid,text,integer,jsonb) to authenticated;
grant execute on function backup_private.restore_ancillary(uuid,text,integer,jsonb) to authenticated;

create function public.accounting_import_finish_job(p_job uuid) returns jsonb
language sql security invoker set search_path=''
begin atomic
  select backup_private.finish_job(p_job);
end;
revoke all on function public.accounting_import_finish_job(uuid) from public,anon;
grant execute on function public.accounting_import_finish_job(uuid) to authenticated;
grant execute on function backup_private.finish_job(uuid) to authenticated;
-- Pre-parsed invoker wrappers reference guarded private entry points by OID.
-- Application roles have no private-schema USAGE or table privileges.

create function public.accounting_import_start_job(p_format text,p_version text,p_ancillary jsonb) returns jsonb
language sql security invoker set search_path=''
begin atomic
  select backup_private.start_job(p_format,p_version,p_ancillary);
end;
revoke all on function public.accounting_import_start_job(text,text,jsonb) from public,anon;
grant execute on function public.accounting_import_start_job(text,text,jsonb) to authenticated;
grant execute on function backup_private.start_job(text,text,jsonb) to authenticated;

create function public.accounting_import_stage_chunk(p_job uuid,p_table text,p_index integer,p_rows jsonb) returns jsonb
language sql security invoker set search_path=''
begin atomic
  select backup_private.stage_chunk(p_job,p_table,p_index,p_rows);
end;
revoke all on function public.accounting_import_stage_chunk(uuid,text,integer,jsonb) from public,anon;
grant execute on function public.accounting_import_stage_chunk(uuid,text,integer,jsonb) to authenticated;
grant execute on function backup_private.stage_chunk(uuid,text,integer,jsonb) to authenticated;

create function public.accounting_import_seal_job(p_job uuid,p_manifest jsonb) returns jsonb
language sql security invoker set search_path=''
begin atomic
  select backup_private.seal_job(p_job,p_manifest);
end;
revoke all on function public.accounting_import_seal_job(uuid,jsonb) from public,anon;
grant execute on function public.accounting_import_seal_job(uuid,jsonb) to authenticated;
grant execute on function backup_private.seal_job(uuid,jsonb) to authenticated;

create function public.accounting_import_validate_job(p_job uuid) returns jsonb
language sql security invoker set search_path=''
begin atomic
  select backup_private.validate_job(p_job);
end;
revoke all on function public.accounting_import_validate_job(uuid) from public,anon;
grant execute on function public.accounting_import_validate_job(uuid) to authenticated;
grant execute on function backup_private.validate_job(uuid) to authenticated;

create function public.accounting_import_finalize_job(p_job uuid,p_digest text) returns jsonb
language sql security invoker set search_path=''
begin atomic
  select backup_private.finalize_job(p_job,p_digest);
end;
revoke all on function public.accounting_import_finalize_job(uuid,text) from public,anon;
grant execute on function public.accounting_import_finalize_job(uuid,text) to authenticated;
grant execute on function backup_private.finalize_job(uuid,text) to authenticated;

create function public.accounting_import_get_job(p_job uuid) returns jsonb
language sql security invoker set search_path=''
begin atomic
  select backup_private.get_job(p_job);
end;
revoke all on function public.accounting_import_get_job(uuid) from public,anon;
grant execute on function public.accounting_import_get_job(uuid) to authenticated;
grant execute on function backup_private.get_job(uuid) to authenticated;

create function public.accounting_import_cancel_job(p_job uuid) returns jsonb
language sql security invoker set search_path=''
begin atomic
  select backup_private.cancel_job(p_job);
end;
revoke all on function public.accounting_import_cancel_job(uuid) from public,anon;
grant execute on function public.accounting_import_cancel_job(uuid) to authenticated;
grant execute on function backup_private.cancel_job(uuid) to authenticated;

create function backup_private.advance_reset_epoch(p_org uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform backup_private.lock_identity(p_org);
  update backup_private.organization_identity_locks set epoch=epoch+1 where organization_id=p_org;
end; $$;
alter function backup_private.advance_reset_epoch(uuid) owner to backup_identity_executor;
revoke all on function backup_private.advance_reset_epoch(uuid) from public,anon,authenticated;
grant execute on function backup_private.advance_reset_epoch(uuid) to backup_import_executor;

create function backup_private.prepare_factory_reset(p_org uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  -- Called only by the existing authorized reset function, before its first DELETE.
  perform backup_private.advance_reset_epoch(p_org);
  update backup_private.jobs set state='cancelled',last_error='Factory Reset invalidated this backup upload.'
    where organization_id=p_org;
  delete from backup_private.chunks c using backup_private.jobs j
    where c.job_id=j.id and j.organization_id=p_org;
end; $$;
alter function backup_private.prepare_factory_reset(uuid) owner to backup_import_executor;
revoke all on function backup_private.prepare_factory_reset(uuid) from public,anon,authenticated;

-- Existing reset body and authorization retained; only the private pre-delete hook is new.
-- Migration 20260610124000: Add factory reset coverage and owner guard.
-- Redeclares public.reset_organization_to_factory_defaults to:
-- 1. Add deletions for cash_shifts, staff_permissions, and loss_prevention_events.
-- 2. Add explicit deletions for credit_payments, customer_write_offs, and supplier_write_offs before parent deletions.
-- 3. Add ownership authorization guard at the database layer (restricted to 'owner' profile role).
-- 4. Exclude service_role from the ownership check to permit automated/platform triggers.

create or replace function public.reset_organization_to_factory_defaults(
  p_organization_id uuid,
  p_actor_id uuid,
  p_reset_settings boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
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
  -- Require authentication (bypass if called via service_role)
  if auth.role() <> 'service_role' then
    if v_user_id is null then
      raise exception 'Not authenticated';
    end if;

    -- Verify the caller belongs to the organization and is the owner
    if not exists (
      select 1 from public.profiles
      where id = v_user_id
        and organization_id = p_organization_id
        and role = 'owner'::public.user_role
    ) then
      raise exception 'Not authorized to reset this organization';
    end if;
  end if;

  perform backup_private.prepare_factory_reset(p_organization_id);

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
  delete from public.supplier_ledger_entries where organization_id = p_organization_id;
  get diagnostics v_supplier_ledger_entries_cnt = row_count;

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
  delete from public.customer_ledger_entries where organization_id = p_organization_id;
  get diagnostics v_customer_ledger_entries_cnt = row_count;

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

-- Revoke default PUBLIC/anon execute, grant only to authenticated + service_role
revoke execute on function public.reset_organization_to_factory_defaults(uuid, uuid, boolean)
  from public, anon;

grant execute on function public.reset_organization_to_factory_defaults(uuid, uuid, boolean)
  to authenticated, service_role;

revoke create on schema backup_private from backup_identity_executor, backup_collision_reader;
commit;

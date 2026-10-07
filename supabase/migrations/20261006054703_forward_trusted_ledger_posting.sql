-- Forward trust only. No legacy ordering or balance reconstruction.
begin;

-- Acquire every policy/grant and account relation before the snapshot. NOWAIT
-- makes active old writers abort this whole migration instead of creating a
-- profile/account lock-order cycle. Retry cutover only after traffic drains.
lock table public.profiles, public.staff_permissions, public.organizations,
  public.branches, public.customers, public.suppliers, public.products,
  public.product_stock_lots, public.invoices, public.invoice_items,
  public.invoice_item_stock_allocations, public.stock_movements,
  public.payments, public.credit_payments, public.customer_write_offs,
  public.returns, public.return_items, public.return_stock_allocations,
  public.supplier_purchases, public.supplier_purchase_items,
  public.supplier_payments, public.supplier_write_offs, public.audit_logs,
  public.customer_ledger_entries, public.supplier_ledger_entries,
  public.repair_status_history, public.repairs, public.expenses,
  public.daily_closings, public.product_categories, public.import_row_mappings,
  public.import_jobs, public.cash_shifts, public.loss_prevention_events,
  public.app_settings
  in access exclusive mode nowait;

-- An old tenant-installed callback must not inherit the new executor authority.
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_trigger t
    join pg_catalog.pg_proc p on p.oid = t.tgfoid
    join pg_catalog.pg_locks l on l.relation = t.tgrelid
    where l.pid = pg_backend_pid() and l.mode = 'AccessExclusiveLock' and l.granted
      and not t.tgisinternal
      and pg_catalog.pg_get_userbyid(p.proowner) not in ('postgres', 'supabase_admin', 'backup_identity_executor')
  ) then
    raise exception 'An unreviewed database callback blocks accounting cutover. Contact an administrator.' using errcode = '42501';
  end if;
end;
$$;

create role ledger_posting_executor nologin nosuperuser nobypassrls;
grant ledger_posting_executor to postgres;
create role ledger_reset_executor nologin nosuperuser nobypassrls;
grant ledger_reset_executor to postgres;
create schema ledger_private authorization ledger_posting_executor;
revoke all on schema ledger_private from public, anon, authenticated, service_role,
  backup_import_executor, backup_identity_executor, backup_collision_reader;
grant usage on schema public to ledger_posting_executor;
grant usage on schema ledger_private to authenticated, service_role;
grant usage on schema public, ledger_private, backup_private to ledger_reset_executor;

-- Resolve Auth at definition time; the executor needs no Auth schema privilege.
create function ledger_private.actor_id() returns uuid
language sql stable security invoker set search_path = ''
begin atomic
  select auth.uid();
end;
alter function ledger_private.actor_id() owner to ledger_posting_executor;
revoke all on function ledger_private.actor_id() from public, anon, authenticated, service_role;
grant execute on function ledger_private.actor_id() to ledger_reset_executor;

create sequence ledger_private.customer_posting_sequence as bigint cache 1;
create sequence ledger_private.supplier_posting_sequence as bigint cache 1;
alter sequence ledger_private.customer_posting_sequence owner to ledger_posting_executor;
alter sequence ledger_private.supplier_posting_sequence owner to ledger_posting_executor;
revoke all on all sequences in schema ledger_private from public, anon, authenticated,
  service_role, backup_import_executor, backup_identity_executor, backup_collision_reader;

alter table public.customer_ledger_entries
  add column posting_sequence bigint,
  add column posting_trust_version smallint,
  add column posting_effective_at timestamptz,
  add constraint customer_posting_provenance check (
    (posting_sequence is null and posting_trust_version is null and posting_effective_at is null)
    or (posting_sequence > 0 and posting_trust_version = 1 and posting_effective_at is not null));
alter table public.supplier_ledger_entries
  add column posting_sequence bigint,
  add column posting_trust_version smallint,
  add column posting_effective_at timestamptz,
  add constraint supplier_posting_provenance check (
    (posting_sequence is null and posting_trust_version is null and posting_effective_at is null)
    or (posting_sequence > 0 and posting_trust_version = 1 and posting_effective_at is not null));
create unique index customer_posting_sequence_unique on public.customer_ledger_entries(posting_sequence)
  where posting_sequence is not null;
create unique index supplier_posting_sequence_unique on public.supplier_ledger_entries(posting_sequence)
  where posting_sequence is not null;
create index customer_trusted_account_order on public.customer_ledger_entries(customer_id, posting_sequence desc)
  where posting_sequence is not null;
create index supplier_trusted_account_order on public.supplier_ledger_entries(supplier_id, posting_sequence desc)
  where posting_sequence is not null;

create table ledger_private.customer_anchors (
  customer_id uuid primary key references public.customers(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  anchor_balance numeric(12,2) not null,
  trusted_from timestamptz not null,
  trust_version smallint not null check (trust_version = 1)
);
create table ledger_private.supplier_anchors (
  supplier_id uuid primary key references public.suppliers(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  anchor_balance numeric(12,2) not null,
  trusted_from timestamptz not null,
  trust_version smallint not null check (trust_version = 1)
);
alter table ledger_private.customer_anchors owner to ledger_posting_executor;
alter table ledger_private.supplier_anchors owner to ledger_posting_executor;
alter table ledger_private.customer_anchors enable row level security;
alter table ledger_private.supplier_anchors enable row level security;
revoke all on all tables in schema ledger_private from public, anon, authenticated, service_role,
  backup_import_executor, backup_identity_executor, backup_collision_reader;
grant select on ledger_private.customer_anchors, ledger_private.supplier_anchors to authenticated;
create policy customer_anchor_read on ledger_private.customer_anchors for select to authenticated
  using (organization_id = public.current_organization_id());
create policy supplier_anchor_read on ledger_private.supplier_anchors for select to authenticated
  using (organization_id = public.current_organization_id());

with boundary as materialized (select clock_timestamp() as effective_at),
customer_snapshot as (
  insert into ledger_private.customer_anchors
  select id, organization_id, outstanding_balance, effective_at, 1
  from public.customers cross join boundary returning customer_id
)
insert into ledger_private.supplier_anchors
select id, organization_id, outstanding_balance, effective_at, 1
from public.suppliers cross join boundary;

revoke insert, update, delete, truncate, references, trigger
  on public.customer_ledger_entries, public.supplier_ledger_entries from public, anon, authenticated, service_role;
revoke delete, truncate on public.customers, public.suppliers from public, anon, authenticated, service_role;
-- Tenant-created callbacks must never run with a private executor's privileges.
revoke trigger on public.customers, public.suppliers, public.products,
  public.product_stock_lots, public.invoices, public.invoice_items,
  public.invoice_item_stock_allocations, public.stock_movements, public.payments,
  public.credit_payments, public.customer_write_offs, public.returns,
  public.return_items, public.return_stock_allocations, public.supplier_purchases,
  public.supplier_purchase_items, public.supplier_payments, public.supplier_write_offs,
  public.audit_logs, public.organizations, public.repair_status_history,
  public.repairs, public.expenses, public.daily_closings, public.product_categories,
  public.import_row_mappings, public.import_jobs, public.cash_shifts,
  public.staff_permissions, public.loss_prevention_events, public.app_settings
  from public, anon, authenticated, service_role;
alter table public.customer_ledger_entries drop constraint customer_ledger_entries_customer_id_fkey,
  add constraint customer_ledger_entries_customer_id_fkey foreign key (customer_id)
    references public.customers(id) on delete restrict;
alter table public.supplier_ledger_entries drop constraint supplier_ledger_entries_supplier_id_fkey,
  add constraint supplier_ledger_entries_supplier_id_fkey foreign key (supplier_id)
    references public.suppliers(id) on delete restrict;

create function ledger_private.guard_account_delete() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user <> 'ledger_reset_executor' then
    raise exception 'Accounting accounts cannot be deleted. Archive the customer or deactivate the supplier.' using errcode = '42501';
  end if;
  return old;
end;
$$;
alter function ledger_private.guard_account_delete() owner to ledger_posting_executor;
revoke all on function ledger_private.guard_account_delete() from public, anon, authenticated, service_role;
create trigger ledger_customer_delete_guard before delete on public.customers
for each row execute function ledger_private.guard_account_delete();
create trigger ledger_supplier_delete_guard before delete on public.suppliers
for each row execute function ledger_private.guard_account_delete();

create function ledger_private.guard_anchor() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op <> 'DELETE' or current_user <> 'ledger_reset_executor' then
    raise exception 'Accounting anchors cannot be changed or deleted.' using errcode = '42501';
  end if;
  return old;
end;
$$;
alter function ledger_private.guard_anchor() owner to ledger_posting_executor;
revoke all on function ledger_private.guard_anchor() from public, anon, authenticated, service_role;
create trigger ledger_customer_anchor_guard before update or delete on ledger_private.customer_anchors
for each row execute function ledger_private.guard_anchor();
create trigger ledger_supplier_anchor_guard before update or delete on ledger_private.supplier_anchors
for each row execute function ledger_private.guard_anchor();

create function ledger_private.guard_truncate() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Accounting history cannot be truncated. Use the checked Factory Reset.' using errcode = '42501';
end;
$$;
alter function ledger_private.guard_truncate() owner to ledger_posting_executor;
revoke all on function ledger_private.guard_truncate() from public, anon, authenticated, service_role;
create trigger ledger_customer_truncate_guard before truncate on public.customers
for each statement execute function ledger_private.guard_truncate();
create trigger ledger_supplier_truncate_guard before truncate on public.suppliers
for each statement execute function ledger_private.guard_truncate();
create trigger ledger_customer_history_truncate_guard before truncate on public.customer_ledger_entries
for each statement execute function ledger_private.guard_truncate();
create trigger ledger_supplier_history_truncate_guard before truncate on public.supplier_ledger_entries
for each statement execute function ledger_private.guard_truncate();
create trigger ledger_customer_anchor_truncate_guard before truncate on ledger_private.customer_anchors
for each statement execute function ledger_private.guard_truncate();
create trigger ledger_supplier_anchor_truncate_guard before truncate on ledger_private.supplier_anchors
for each statement execute function ledger_private.guard_truncate();

create function ledger_private.guard_account() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if current_user not in ('postgres', 'supabase_admin', 'backup_import_executor')
      and new.outstanding_balance is distinct from 0::numeric then
      raise exception 'New accounts must start with zero outstanding. Use the Owner accounting restore for opening balances.' using errcode = '42501';
    end if;
  else
    if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id then
      raise exception 'Accounting account identity cannot be reassigned.' using errcode = '42501';
    end if;
    if new.outstanding_balance is distinct from old.outstanding_balance
      and current_user not in ('postgres', 'supabase_admin', 'ledger_posting_executor') then
      raise exception 'Outstanding balance can only change through an approved accounting transaction.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
alter function ledger_private.guard_account() owner to ledger_posting_executor;
revoke all on function ledger_private.guard_account() from public, anon, authenticated, service_role;
create trigger ledger_customer_account_guard before insert or update on public.customers
for each row execute function ledger_private.guard_account();
create trigger ledger_supplier_account_guard before insert or update on public.suppliers
for each row execute function ledger_private.guard_account();

-- Statement transition tables keep bulk restore anchoring set-based.
create function ledger_private.anchor_customers() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into ledger_private.customer_anchors
  select id, organization_id, outstanding_balance, clock_timestamp(), 1 from new_accounts;
  return null;
end;
$$;
create function ledger_private.anchor_suppliers() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into ledger_private.supplier_anchors
  select id, organization_id, outstanding_balance, clock_timestamp(), 1 from new_accounts;
  return null;
end;
$$;
alter function ledger_private.anchor_customers() owner to ledger_posting_executor;
alter function ledger_private.anchor_suppliers() owner to ledger_posting_executor;
revoke all on function ledger_private.anchor_customers(), ledger_private.anchor_suppliers()
  from public, anon, authenticated, service_role, backup_import_executor;
create trigger ledger_customer_anchor after insert on public.customers
referencing new table as new_accounts for each statement execute function ledger_private.anchor_customers();
create trigger ledger_supplier_anchor after insert on public.suppliers
referencing new table as new_accounts for each statement execute function ledger_private.anchor_suppliers();

create function ledger_private.guard_customer_posting() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_balance numeric; v_prior numeric; v_anchor record; v_time timestamptz;
begin
  if tg_op <> 'INSERT' then
    if tg_op <> 'DELETE' or current_user <> 'ledger_reset_executor' then
      raise exception 'Trusted accounting history cannot be changed or deleted.' using errcode = '42501';
    end if;
    return old;
  end if;
  if current_user = 'backup_import_executor' then
    new.posting_sequence := null; new.posting_trust_version := null; new.posting_effective_at := null;
    return new;
  end if;
  if current_user <> 'ledger_posting_executor' then
    raise exception 'Ledger entries require an approved accounting transaction.' using errcode = '42501';
  end if;
  if new.posting_sequence is not null or new.posting_trust_version is not null or new.posting_effective_at is not null then
    raise exception 'Accounting provenance is allocated by the database.' using errcode = '42501';
  end if;
  select outstanding_balance into v_balance from public.customers
    where id = new.customer_id and organization_id = new.organization_id for update;
  if not found then raise exception 'Customer accounting state is unavailable.' using errcode = '42501'; end if;
  select * into strict v_anchor from ledger_private.customer_anchors
    where customer_id = new.customer_id and organization_id = new.organization_id;
  select balance_after, posting_effective_at into v_prior, v_time from public.customer_ledger_entries
    where customer_id = new.customer_id and posting_sequence is not null
    order by posting_sequence desc limit 1;
  v_prior := coalesce(v_prior, v_anchor.anchor_balance);
  if new.direction = 'debit' then v_prior := v_prior + new.amount;
  else v_prior := v_prior - new.amount; end if;
  if v_prior is distinct from v_balance then
    raise exception 'Customer balance and accounting movement do not agree.' using errcode = '23514';
  end if;
  new.balance_after := v_prior;
  new.posting_sequence := nextval('ledger_private.customer_posting_sequence'::regclass);
  new.posting_trust_version := v_anchor.trust_version;
  new.posting_effective_at := greatest(clock_timestamp(), v_anchor.trusted_from, v_time);
  return new;
end;
$$;

create function ledger_private.guard_supplier_posting() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_balance numeric; v_prior numeric; v_anchor record; v_time timestamptz;
begin
  if tg_op <> 'INSERT' then
    if tg_op <> 'DELETE' or current_user <> 'ledger_reset_executor' then
      raise exception 'Trusted accounting history cannot be changed or deleted.' using errcode = '42501';
    end if;
    return old;
  end if;
  if current_user = 'backup_import_executor' then
    new.posting_sequence := null; new.posting_trust_version := null; new.posting_effective_at := null;
    return new;
  end if;
  if current_user <> 'ledger_posting_executor' then
    raise exception 'Ledger entries require an approved accounting transaction.' using errcode = '42501';
  end if;
  if new.posting_sequence is not null or new.posting_trust_version is not null or new.posting_effective_at is not null then
    raise exception 'Accounting provenance is allocated by the database.' using errcode = '42501';
  end if;
  select outstanding_balance into v_balance from public.suppliers
    where id = new.supplier_id and organization_id = new.organization_id for update;
  if not found then raise exception 'Supplier accounting state is unavailable.' using errcode = '42501'; end if;
  select * into strict v_anchor from ledger_private.supplier_anchors
    where supplier_id = new.supplier_id and organization_id = new.organization_id;
  select balance_after, posting_effective_at into v_prior, v_time from public.supplier_ledger_entries
    where supplier_id = new.supplier_id and posting_sequence is not null
    order by posting_sequence desc limit 1;
  v_prior := coalesce(v_prior, v_anchor.anchor_balance);
  if new.direction = 'credit' then v_prior := v_prior + new.amount;
  else v_prior := v_prior - new.amount; end if;
  if v_prior is distinct from v_balance then
    raise exception 'Supplier balance and accounting movement do not agree.' using errcode = '23514';
  end if;
  new.balance_after := v_prior;
  new.posting_sequence := nextval('ledger_private.supplier_posting_sequence'::regclass);
  new.posting_trust_version := v_anchor.trust_version;
  new.posting_effective_at := greatest(clock_timestamp(), v_anchor.trusted_from, v_time);
  return new;
end;
$$;
alter function ledger_private.guard_customer_posting() owner to ledger_posting_executor;
alter function ledger_private.guard_supplier_posting() owner to ledger_posting_executor;
revoke all on function ledger_private.guard_customer_posting(), ledger_private.guard_supplier_posting()
  from public, anon, authenticated, service_role, backup_import_executor;
create trigger ledger_customer_posting before insert or update or delete on public.customer_ledger_entries
for each row execute function ledger_private.guard_customer_posting();
create trigger ledger_supplier_posting before insert or update or delete on public.supplier_ledger_entries
for each row execute function ledger_private.guard_supplier_posting();

-- Checked Factory Reset explicitly deletes protected children and anchors first.
-- Ordinary account and higher-parent cascades cannot erase accounting history.

-- EXACT CURRENT WRITER IMPLEMENTATIONS AND SCOPED EXECUTOR PRIVILEGES FOLLOW.

-- No inherited application role or DELETE authority. RLS predicates match the
-- existing authenticated policies only for these seven implementations.
grant INSERT, SELECT on public.audit_logs to ledger_posting_executor;
-- The existing loss-sale audit trigger inserts its organization-scoped event.
grant INSERT on public.loss_prevention_events to ledger_posting_executor;
create policy ledger_executor_loss_event on public.loss_prevention_events for insert to ledger_posting_executor
with check (organization_id = public.current_organization_id());
grant SELECT on public.branches to ledger_posting_executor;
grant INSERT, SELECT on public.credit_payments to ledger_posting_executor;
grant INSERT, SELECT on public.customer_ledger_entries to ledger_posting_executor;
grant INSERT, SELECT on public.customer_write_offs to ledger_posting_executor;
grant SELECT, UPDATE on public.customers to ledger_posting_executor;
grant INSERT, SELECT on public.invoice_item_stock_allocations to ledger_posting_executor;
-- PostgreSQL requires an UPDATE privilege for the existing return row lock.
grant UPDATE (quantity) on public.invoice_item_stock_allocations to ledger_posting_executor;
grant INSERT, SELECT, UPDATE on public.invoice_items to ledger_posting_executor;
grant INSERT, SELECT, UPDATE on public.invoices to ledger_posting_executor;
grant SELECT, UPDATE on public.organizations to ledger_posting_executor;
grant INSERT, SELECT on public.payments to ledger_posting_executor;
grant INSERT, SELECT, UPDATE on public.product_stock_lots to ledger_posting_executor;
grant SELECT, UPDATE on public.products to ledger_posting_executor;
grant SELECT on public.profiles to ledger_posting_executor;
grant INSERT, SELECT on public.return_items to ledger_posting_executor;
grant INSERT, SELECT on public.return_stock_allocations to ledger_posting_executor;
grant INSERT, SELECT, UPDATE on public.returns to ledger_posting_executor;
grant SELECT on public.staff_permissions to ledger_posting_executor;
grant INSERT, SELECT on public.stock_movements to ledger_posting_executor;
grant INSERT, SELECT on public.supplier_ledger_entries to ledger_posting_executor;
grant INSERT, SELECT on public.supplier_payments to ledger_posting_executor;
grant INSERT, SELECT on public.supplier_purchase_items to ledger_posting_executor;
grant INSERT, SELECT, UPDATE on public.supplier_purchases to ledger_posting_executor;
grant INSERT, SELECT on public.supplier_write_offs to ledger_posting_executor;
grant SELECT, UPDATE on public.suppliers to ledger_posting_executor;
grant execute on function public.current_organization_id(), public.current_user_role() to ledger_posting_executor;
create policy ledger_executor_1 on public.audit_logs for insert to ledger_posting_executor with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_2 on public.audit_logs for select to ledger_posting_executor using ((organization_id = public.current_organization_id()));
create policy ledger_executor_3 on public.branches for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_4 on public.credit_payments for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_5 on public.customer_ledger_entries for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_6 on public.customer_write_offs for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_7 on public.customers for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_8 on public.invoice_item_stock_allocations for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_9 on public.invoice_items for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_10 on public.invoices for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_11 on public.organizations for select to ledger_posting_executor using ((id = public.current_organization_id()));
create policy ledger_executor_12 on public.organizations for update to ledger_posting_executor using (((id = public.current_organization_id()) AND (public.current_user_role() = ANY (ARRAY['owner'::public.user_role, 'admin'::public.user_role])))) with check ((id = public.current_organization_id()));
create policy ledger_executor_13 on public.payments for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_14 on public.product_stock_lots for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_15 on public.products for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_16 on public.profiles for select to ledger_posting_executor using (((id = ledger_private.actor_id()) OR (organization_id = public.current_organization_id())));
create policy ledger_executor_17 on public.return_items for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_18 on public.return_stock_allocations for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_19 on public.returns for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_20 on public.staff_permissions for select to ledger_posting_executor using (((profile_id = ledger_private.actor_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ledger_private.actor_id()) AND (profiles.organization_id = staff_permissions.organization_id) AND (profiles.role = ANY (ARRAY['owner'::public.user_role, 'admin'::public.user_role])))))));
create policy ledger_executor_21 on public.stock_movements for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_22 on public.supplier_ledger_entries for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_23 on public.supplier_payments for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_24 on public.supplier_purchase_items for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_25 on public.supplier_purchases for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_26 on public.supplier_write_offs for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));
create policy ledger_executor_27 on public.suppliers for all to ledger_posting_executor using ((organization_id = public.current_organization_id())) with check ((organization_id = public.current_organization_id()));

create or replace function ledger_private.pos_checkout(
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
security definer
set search_path = ''
as $$
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
alter function ledger_private.pos_checkout(p_branch_id uuid, p_customer_id uuid, p_cart jsonb, p_discount_total numeric, p_payment_method payment_method, p_amount_paid numeric, p_payment_ref text, p_note text, p_allow_loss_override boolean, p_idempotency_key text) owner to ledger_posting_executor;
revoke all on function ledger_private.pos_checkout(p_branch_id uuid, p_customer_id uuid, p_cart jsonb, p_discount_total numeric, p_payment_method payment_method, p_amount_paid numeric, p_payment_ref text, p_note text, p_allow_loss_override boolean, p_idempotency_key text) from public, anon, authenticated, service_role;
grant execute on function ledger_private.pos_checkout(p_branch_id uuid, p_customer_id uuid, p_cart jsonb, p_discount_total numeric, p_payment_method payment_method, p_amount_paid numeric, p_payment_ref text, p_note text, p_allow_loss_override boolean, p_idempotency_key text) to authenticated, service_role;

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
language sql
security invoker
set search_path = ''
as $$
  select * from ledger_private.pos_checkout(p_branch_id, p_customer_id, p_cart, p_discount_total, p_payment_method, p_amount_paid, p_payment_ref, p_note, p_allow_loss_override, p_idempotency_key);
$$;

create or replace function ledger_private.record_credit_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_method public.credit_payment_method,
  p_reference_number text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
alter function ledger_private.record_credit_payment(p_customer_id uuid, p_amount numeric, p_method credit_payment_method, p_reference_number text, p_notes text) owner to ledger_posting_executor;
revoke all on function ledger_private.record_credit_payment(p_customer_id uuid, p_amount numeric, p_method credit_payment_method, p_reference_number text, p_notes text) from public, anon, authenticated, service_role;
grant execute on function ledger_private.record_credit_payment(p_customer_id uuid, p_amount numeric, p_method credit_payment_method, p_reference_number text, p_notes text) to authenticated, service_role;

create or replace function public.record_credit_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_method public.credit_payment_method,
  p_reference_number text,
  p_notes text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select ledger_private.record_credit_payment(p_customer_id, p_amount, p_method, p_reference_number, p_notes);
$$;

create or replace function ledger_private.create_invoice_return(
  p_invoice_id uuid,
  p_items jsonb,
  p_refund_amount numeric,
  p_refund_method text,
  p_reference_number text,
  p_notes text
)
returns table(return_id uuid, return_no text, subtotal numeric, refund_amount numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := ledger_private.actor_id();
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
alter function ledger_private.create_invoice_return(p_invoice_id uuid, p_items jsonb, p_refund_amount numeric, p_refund_method text, p_reference_number text, p_notes text) owner to ledger_posting_executor;
revoke all on function ledger_private.create_invoice_return(p_invoice_id uuid, p_items jsonb, p_refund_amount numeric, p_refund_method text, p_reference_number text, p_notes text) from public, anon, authenticated, service_role;
grant execute on function ledger_private.create_invoice_return(p_invoice_id uuid, p_items jsonb, p_refund_amount numeric, p_refund_method text, p_reference_number text, p_notes text) to authenticated, service_role;

create or replace function public.create_invoice_return(
  p_invoice_id uuid,
  p_items jsonb,
  p_refund_amount numeric,
  p_refund_method text,
  p_reference_number text,
  p_notes text
)
returns table(return_id uuid, return_no text, subtotal numeric, refund_amount numeric)
language sql
security invoker
set search_path = ''
as $$
  select * from ledger_private.create_invoice_return(p_invoice_id, p_items, p_refund_amount, p_refund_method, p_reference_number, p_notes);
$$;

create or replace function ledger_private.record_customer_write_off(
  p_customer_id uuid,
  p_amount numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
alter function ledger_private.record_customer_write_off(p_customer_id uuid, p_amount numeric, p_reason text) owner to ledger_posting_executor;
revoke all on function ledger_private.record_customer_write_off(p_customer_id uuid, p_amount numeric, p_reason text) from public, anon, authenticated, service_role;
grant execute on function ledger_private.record_customer_write_off(p_customer_id uuid, p_amount numeric, p_reason text) to authenticated, service_role;

create or replace function public.record_customer_write_off(
  p_customer_id uuid,
  p_amount numeric,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select ledger_private.record_customer_write_off(p_customer_id, p_amount, p_reason);
$$;

create or replace function ledger_private.create_supplier_purchase(
  p_supplier_id uuid,
  p_branch_id uuid,
  p_purchase_date date,
  p_items jsonb,
  p_discount_total numeric,
  p_reference_no text,
  p_notes text,
  p_payment_method public.payment_method,
  p_amount_paid numeric,
  p_payment_ref text
)
returns table(purchase_id uuid, purchase_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := ledger_private.actor_id();
  v_profile public.profiles%rowtype;
  v_org_id uuid;
  v_profile_id uuid;
  v_branch_id uuid;
  v_purchase_id uuid := gen_random_uuid();
  v_purchase_no text;
  v_seq int;
  v_subtotal numeric := 0;
  v_grand numeric;
  v_balance numeric;
  v_item jsonb;
  v_product record;
  v_qty int;
  v_unit_cost numeric;
  v_line_total numeric;
  v_status text;
  v_lot_id uuid;
  v_item_id uuid;
  v_supplier_balance numeric;
  v_payment_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select *
    into v_profile
    from public.profiles
    where id = v_user_id
      and is_active = true;
  if not found or v_profile.organization_id is null then
    raise exception 'No active profile' using errcode = 'P0001';
  end if;
  if v_profile.role not in ('owner', 'admin', 'manager') then
    raise exception 'You do not have permission to record supplier purchases.'
      using errcode = '42501';
  end if;

  v_profile_id := v_profile.id;
  v_org_id := v_profile.organization_id;
  v_branch_id := coalesce(p_branch_id, v_profile.branch_id);
  if v_branch_id is null or not exists (
    select 1
    from public.branches b
    where b.id = v_branch_id
      and b.organization_id = v_org_id
      and b.is_active = true
  ) then
    raise exception 'No active branch is assigned to this purchase.'
      using errcode = '42501';
  end if;

  perform 1
  from public.suppliers s
  where s.id = p_supplier_id
    and s.organization_id = v_org_id
    and s.is_active = true
  for update;
  if not found then
    raise exception 'Supplier not found or inactive' using errcode = 'P0001';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Purchase must include at least one item' using errcode = 'P0001';
  end if;

  -- Retain the per-organization lock that serializes purchase numbering.
  perform 1
  from public.organizations o
  where o.id = v_org_id
  for update;

  select coalesce(
    max(
      nullif(
        regexp_replace(sp.purchase_no, '\D', '', 'g'),
        ''
      )::int
    ),
    0
  ) + 1
    into v_seq
    from public.supplier_purchases sp
    where sp.organization_id = v_org_id;
  v_purchase_no := 'PUR-' || lpad(v_seq::text, 6, '0');

  -- First pass: validate every item before creating any purchase artifacts.
  for v_item in select * from jsonb_array_elements(p_items) loop
    select p.id, p.name, p.type, p.is_active
      into v_product
      from public.products p
      where p.id = (v_item->>'product_id')::uuid
        and p.organization_id = v_org_id
      for update;
    if not found then
      raise exception 'Product not in catalog' using errcode = 'P0001';
    end if;
    if not v_product.is_active then
      raise exception 'Product not available: %', v_product.name using errcode = 'P0001';
    end if;
    if v_product.type <> 'product' then
      raise exception 'Cannot purchase stock for non-product item: %', v_product.name
        using errcode = 'P0001';
    end if;

    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 then
      raise exception 'Invalid quantity for %', v_product.name using errcode = 'P0001';
    end if;

    v_unit_cost := coalesce(nullif(v_item->>'unit_cost', '')::numeric, 0);
    if v_unit_cost < 0 then
      raise exception 'Negative unit cost for %', v_product.name using errcode = 'P0001';
    end if;

    v_line_total := v_unit_cost * v_qty;
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  if coalesce(p_discount_total, 0) < 0 then
    raise exception 'Discount cannot be negative' using errcode = 'P0001';
  end if;
  v_grand := greatest(v_subtotal - coalesce(p_discount_total, 0), 0);
  if coalesce(p_amount_paid, 0) < 0 then
    raise exception 'Amount paid cannot be negative' using errcode = 'P0001';
  end if;
  if coalesce(p_amount_paid, 0) > v_grand then
    raise exception 'Amount paid cannot exceed grand total' using errcode = 'P0001';
  end if;
  -- Both supplier ledger movements must be whole-paisa values before any writes.
  if v_grand::text in ('NaN', 'Infinity', '-Infinity') or v_grand <> round(v_grand, 2) then
    raise exception 'Amount must have no more than 2 decimal places.' using errcode = 'P0001';
  end if;

  if coalesce(p_amount_paid, 0)::text in ('NaN', 'Infinity', '-Infinity') or coalesce(p_amount_paid, 0) <> round(coalesce(p_amount_paid, 0), 2) then
    raise exception 'Amount must have no more than 2 decimal places.' using errcode = 'P0001';
  end if;

  v_balance := greatest(v_grand - coalesce(p_amount_paid, 0), 0);

  v_status := case
    when v_grand = 0 then 'paid'
    when coalesce(p_amount_paid, 0) >= v_grand then 'paid'
    when coalesce(p_amount_paid, 0) > 0 then 'partial'
    else 'unpaid'
  end;

  insert into public.supplier_purchases (
    id, organization_id, branch_id, supplier_id, purchase_no, status,
    purchase_date, subtotal, discount_total, grand_total, amount_paid, balance_due,
    reference_no, notes, created_by
  ) values (
    v_purchase_id, v_org_id, v_branch_id, p_supplier_id, v_purchase_no, v_status,
    coalesce(p_purchase_date, current_date), v_subtotal, coalesce(p_discount_total, 0),
    v_grand, coalesce(p_amount_paid, 0), v_balance,
    nullif(p_reference_no, ''), nullif(p_notes, ''), v_profile_id
  );

  -- Second pass: create one lot, movement, and item row per product.
  for v_item in select * from jsonb_array_elements(p_items) loop
    select p.id, p.name
      into v_product
      from public.products p
      where p.id = (v_item->>'product_id')::uuid
        and p.organization_id = v_org_id;
    v_qty := (v_item->>'quantity')::int;
    v_unit_cost := coalesce(nullif(v_item->>'unit_cost', '')::numeric, 0);
    v_line_total := v_unit_cost * v_qty;
    v_lot_id := gen_random_uuid();
    v_item_id := gen_random_uuid();

    insert into public.product_stock_lots (
      id, organization_id, branch_id, product_id, supplier_id, lot_number,
      purchase_date, quantity_received, quantity_remaining, unit_cost, notes, created_by
    ) values (
      v_lot_id, v_org_id, v_branch_id, v_product.id, p_supplier_id, v_purchase_no,
      coalesce(p_purchase_date, current_date), v_qty, v_qty, v_unit_cost,
      nullif(v_item->>'notes', ''), v_profile_id
    );

    insert into public.stock_movements (
      organization_id, branch_id, product_id, stock_lot_id, movement_type,
      quantity, unit_cost, reference_type, reference_id, notes, created_by
    ) values (
      v_org_id, v_branch_id, v_product.id, v_lot_id, 'purchase',
      v_qty, v_unit_cost, 'supplier_purchase', v_purchase_id,
      'Supplier purchase ' || v_purchase_no, v_profile_id
    );

    insert into public.supplier_purchase_items (
      id, organization_id, purchase_id, product_id, product_name,
      quantity, unit_cost, line_total, stock_lot_id, notes
    ) values (
      v_item_id, v_org_id, v_purchase_id, v_product.id, v_product.name,
      v_qty, v_unit_cost, v_line_total, v_lot_id, nullif(v_item->>'notes', '')
    );

    update public.products p
      set stock_quantity = p.stock_quantity + v_qty
      where p.id = v_product.id
        and p.organization_id = v_org_id;
  end loop;

  select s.outstanding_balance
    into v_supplier_balance
    from public.suppliers s
    where s.id = p_supplier_id
      and s.organization_id = v_org_id;
  v_supplier_balance := coalesce(v_supplier_balance, 0) + v_grand;

  update public.suppliers s
    set outstanding_balance = v_supplier_balance
    where s.id = p_supplier_id
      and s.organization_id = v_org_id;

  insert into public.supplier_ledger_entries (
    organization_id, branch_id, supplier_id, purchase_id, entry_type, direction,
    amount, balance_after, description, reference_number, created_by
  ) values (
    v_org_id, v_branch_id, p_supplier_id, v_purchase_id, 'purchase_credit', 'credit',
    v_grand, v_supplier_balance, 'Purchase ' || v_purchase_no, v_purchase_no, v_profile_id
  );

  if coalesce(p_amount_paid, 0) > 0 then
    v_payment_id := gen_random_uuid();
    insert into public.supplier_payments (
      id, organization_id, branch_id, supplier_id, purchase_id,
      method, amount, reference_no, note, created_by
    ) values (
      v_payment_id, v_org_id, v_branch_id, p_supplier_id, v_purchase_id,
      coalesce(p_payment_method, 'cash'::public.payment_method),
      coalesce(p_amount_paid, 0), nullif(p_payment_ref, ''),
      'Payment with purchase ' || v_purchase_no, v_profile_id
    );

    v_supplier_balance := v_supplier_balance - coalesce(p_amount_paid, 0);
    update public.suppliers s
      set outstanding_balance = v_supplier_balance
      where s.id = p_supplier_id
        and s.organization_id = v_org_id;

    insert into public.supplier_ledger_entries (
      organization_id, branch_id, supplier_id, purchase_id, payment_id,
      entry_type, direction, amount, balance_after, description, reference_number, created_by
    ) values (
      v_org_id, v_branch_id, p_supplier_id, v_purchase_id, v_payment_id,
      'payment_debit', 'debit', coalesce(p_amount_paid, 0), v_supplier_balance,
      'Payment with purchase ' || v_purchase_no, nullif(p_payment_ref, ''), v_profile_id
    );
  end if;

  return query select v_purchase_id, v_purchase_no;
end;
$$;
alter function ledger_private.create_supplier_purchase(p_supplier_id uuid, p_branch_id uuid, p_purchase_date date, p_items jsonb, p_discount_total numeric, p_reference_no text, p_notes text, p_payment_method payment_method, p_amount_paid numeric, p_payment_ref text) owner to ledger_posting_executor;
revoke all on function ledger_private.create_supplier_purchase(p_supplier_id uuid, p_branch_id uuid, p_purchase_date date, p_items jsonb, p_discount_total numeric, p_reference_no text, p_notes text, p_payment_method payment_method, p_amount_paid numeric, p_payment_ref text) from public, anon, authenticated, service_role;
grant execute on function ledger_private.create_supplier_purchase(p_supplier_id uuid, p_branch_id uuid, p_purchase_date date, p_items jsonb, p_discount_total numeric, p_reference_no text, p_notes text, p_payment_method payment_method, p_amount_paid numeric, p_payment_ref text) to authenticated;

create or replace function public.create_supplier_purchase(
  p_supplier_id uuid,
  p_branch_id uuid,
  p_purchase_date date,
  p_items jsonb,
  p_discount_total numeric,
  p_reference_no text,
  p_notes text,
  p_payment_method public.payment_method,
  p_amount_paid numeric,
  p_payment_ref text
)
returns table(purchase_id uuid, purchase_no text)
language sql
security invoker
set search_path = ''
as $$
  select * from ledger_private.create_supplier_purchase(p_supplier_id, p_branch_id, p_purchase_date, p_items, p_discount_total, p_reference_no, p_notes, p_payment_method, p_amount_paid, p_payment_ref);
$$;

create or replace function ledger_private.record_supplier_payment(
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
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := ledger_private.actor_id();
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

  if p_amount::text in ('NaN', 'Infinity', '-Infinity') or p_amount <> round(p_amount, 2) then
    raise exception 'Amount must have no more than 2 decimal places.' using errcode = 'P0001';
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
alter function ledger_private.record_supplier_payment(p_supplier_id uuid, p_purchase_id uuid, p_branch_id uuid, p_method payment_method, p_amount numeric, p_reference_no text, p_note text) owner to ledger_posting_executor;
revoke all on function ledger_private.record_supplier_payment(p_supplier_id uuid, p_purchase_id uuid, p_branch_id uuid, p_method payment_method, p_amount numeric, p_reference_no text, p_note text) from public, anon, authenticated, service_role;
grant execute on function ledger_private.record_supplier_payment(p_supplier_id uuid, p_purchase_id uuid, p_branch_id uuid, p_method payment_method, p_amount numeric, p_reference_no text, p_note text) to authenticated, service_role;

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
language sql
security invoker
set search_path = ''
as $$
  select * from ledger_private.record_supplier_payment(p_supplier_id, p_purchase_id, p_branch_id, p_method, p_amount, p_reference_no, p_note);
$$;

create or replace function ledger_private.record_supplier_write_off(
  p_supplier_id uuid,
  p_branch_id uuid,
  p_amount numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

  if p_branch_id is not null then v_branch_id := p_branch_id; end if;
  if v_branch_id is null then raise exception 'No branch assigned for this user' using errcode = 'P0001'; end if;

  -- Only owner and admin can write off (managers excluded)
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and role in ('owner', 'admin')
  ) then
    raise exception 'Only owner or admin can write off supplier dues' using errcode = 'P0001';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Write-off amount must be positive' using errcode = 'P0001';
  end if;

  if p_amount::text in ('NaN', 'Infinity', '-Infinity') or p_amount <> round(p_amount, 2) then
    raise exception 'Amount must have no more than 2 decimal places.' using errcode = 'P0001';
  end if;

  -- Lock supplier row
  select outstanding_balance into v_curr_balance
    from public.suppliers
    where id = p_supplier_id and organization_id = v_org_id
    for update;
  if not found then raise exception 'Supplier not found' using errcode = 'P0001'; end if;

  if p_amount > coalesce(v_curr_balance, 0) + 0.0001 then
    raise exception 'Write-off amount exceeds outstanding balance' using errcode = 'P0001';
  end if;

  v_balance_after := coalesce(v_curr_balance, 0) - p_amount;

  -- Update supplier outstanding balance
  update public.suppliers
    set outstanding_balance = v_balance_after
    where id = p_supplier_id;

  -- Insert into supplier_write_offs
  insert into public.supplier_write_offs (
    id, organization_id, branch_id, supplier_id, amount, reason, written_by
  ) values (
    v_write_off_id, v_org_id, v_branch_id, p_supplier_id, p_amount, p_reason, v_profile_id
  );

  -- Insert into supplier_ledger_entries
  insert into public.supplier_ledger_entries (
    organization_id, branch_id, supplier_id, entry_type, direction,
    amount, balance_after, description, created_by
  ) values (
    v_org_id, v_branch_id, p_supplier_id, 'adjustment', 'debit',
    p_amount, v_balance_after, 'Write-off: ' || p_reason, v_profile_id
  );
end;
$$;
alter function ledger_private.record_supplier_write_off(p_supplier_id uuid, p_branch_id uuid, p_amount numeric, p_reason text) owner to ledger_posting_executor;
revoke all on function ledger_private.record_supplier_write_off(p_supplier_id uuid, p_branch_id uuid, p_amount numeric, p_reason text) from public, anon, authenticated, service_role;
grant execute on function ledger_private.record_supplier_write_off(p_supplier_id uuid, p_branch_id uuid, p_amount numeric, p_reason text) to authenticated, service_role;

create or replace function public.record_supplier_write_off(
  p_supplier_id uuid,
  p_branch_id uuid,
  p_amount numeric,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select ledger_private.record_supplier_write_off(p_supplier_id, p_branch_id, p_amount, p_reason);
$$;

-- Source posting time, like source sequence/version, is not local provenance.
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
    where key not in ('posting_sequence','posting_trust_version','posting_effective_at') and key not like 'ledger_anchor_%';
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
  return v_result - 'posting_sequence' - 'posting_trust_version' - 'posting_effective_at';
end; $function$;
-- The only destructive authority is this private Factory Reset implementation.
-- Neither application nor import roles can assume its role or execute its core.
grant create on schema ledger_private to ledger_reset_executor;
grant execute on function backup_private.prepare_factory_reset(uuid) to ledger_reset_executor;
grant select on public.profiles to ledger_reset_executor;
create policy ledger_reset_profile_read on public.profiles for select to ledger_reset_executor using (true);
grant insert on public.audit_logs to ledger_reset_executor;
create policy ledger_reset_audit_insert on public.audit_logs for insert to ledger_reset_executor with check (true);
grant select, update (shop_name, business_subtitle, phone, email, address, invoice_template, theme_accent, receipt_footer, settings)
  on public.app_settings to ledger_reset_executor;
create policy ledger_reset_settings on public.app_settings for all to ledger_reset_executor using (true) with check (true);
grant select, delete on ledger_private.customer_anchors, ledger_private.supplier_anchors to ledger_reset_executor;
create policy ledger_reset_customer_anchors on ledger_private.customer_anchors for all to ledger_reset_executor using (true);
create policy ledger_reset_supplier_anchors on ledger_private.supplier_anchors for all to ledger_reset_executor using (true);
grant select, delete on public.cash_shifts to ledger_reset_executor;
create policy ledger_reset_cleanup on public.cash_shifts for all to ledger_reset_executor using (true);
grant select, delete on public.credit_payments to ledger_reset_executor;
create policy ledger_reset_cleanup on public.credit_payments for all to ledger_reset_executor using (true);
grant select, delete on public.customer_ledger_entries to ledger_reset_executor;
create policy ledger_reset_cleanup on public.customer_ledger_entries for all to ledger_reset_executor using (true);
grant select, delete on public.customer_write_offs to ledger_reset_executor;
create policy ledger_reset_cleanup on public.customer_write_offs for all to ledger_reset_executor using (true);
grant select, delete on public.customers to ledger_reset_executor;
create policy ledger_reset_cleanup on public.customers for all to ledger_reset_executor using (true);
grant select, delete on public.daily_closings to ledger_reset_executor;
create policy ledger_reset_cleanup on public.daily_closings for all to ledger_reset_executor using (true);
grant select, delete on public.expenses to ledger_reset_executor;
create policy ledger_reset_cleanup on public.expenses for all to ledger_reset_executor using (true);
grant select, delete on public.import_jobs to ledger_reset_executor;
create policy ledger_reset_cleanup on public.import_jobs for all to ledger_reset_executor using (true);
grant select, delete on public.import_row_mappings to ledger_reset_executor;
create policy ledger_reset_cleanup on public.import_row_mappings for all to ledger_reset_executor using (true);
grant select, delete on public.invoice_item_stock_allocations to ledger_reset_executor;
create policy ledger_reset_cleanup on public.invoice_item_stock_allocations for all to ledger_reset_executor using (true);
grant select, delete on public.invoice_items to ledger_reset_executor;
create policy ledger_reset_cleanup on public.invoice_items for all to ledger_reset_executor using (true);
grant select, delete on public.invoices to ledger_reset_executor;
create policy ledger_reset_cleanup on public.invoices for all to ledger_reset_executor using (true);
grant select, delete on public.loss_prevention_events to ledger_reset_executor;
create policy ledger_reset_cleanup on public.loss_prevention_events for all to ledger_reset_executor using (true);
grant select, delete on public.payments to ledger_reset_executor;
create policy ledger_reset_cleanup on public.payments for all to ledger_reset_executor using (true);
grant select, delete on public.product_categories to ledger_reset_executor;
create policy ledger_reset_cleanup on public.product_categories for all to ledger_reset_executor using (true);
grant select, delete on public.product_stock_lots to ledger_reset_executor;
create policy ledger_reset_cleanup on public.product_stock_lots for all to ledger_reset_executor using (true);
grant select, delete on public.products to ledger_reset_executor;
create policy ledger_reset_cleanup on public.products for all to ledger_reset_executor using (true);
grant select, delete on public.repair_status_history to ledger_reset_executor;
create policy ledger_reset_cleanup on public.repair_status_history for all to ledger_reset_executor using (true);
grant select, delete on public.repairs to ledger_reset_executor;
create policy ledger_reset_cleanup on public.repairs for all to ledger_reset_executor using (true);
grant select, delete on public.return_items to ledger_reset_executor;
create policy ledger_reset_cleanup on public.return_items for all to ledger_reset_executor using (true);
grant select, delete on public.return_stock_allocations to ledger_reset_executor;
create policy ledger_reset_cleanup on public.return_stock_allocations for all to ledger_reset_executor using (true);
grant select, delete on public.returns to ledger_reset_executor;
create policy ledger_reset_cleanup on public.returns for all to ledger_reset_executor using (true);
grant select, delete on public.staff_permissions to ledger_reset_executor;
create policy ledger_reset_cleanup on public.staff_permissions for all to ledger_reset_executor using (true);
grant select, delete on public.stock_movements to ledger_reset_executor;
create policy ledger_reset_cleanup on public.stock_movements for all to ledger_reset_executor using (true);
grant select, delete on public.supplier_ledger_entries to ledger_reset_executor;
create policy ledger_reset_cleanup on public.supplier_ledger_entries for all to ledger_reset_executor using (true);
grant select, delete on public.supplier_payments to ledger_reset_executor;
create policy ledger_reset_cleanup on public.supplier_payments for all to ledger_reset_executor using (true);
grant select, delete on public.supplier_purchase_items to ledger_reset_executor;
create policy ledger_reset_cleanup on public.supplier_purchase_items for all to ledger_reset_executor using (true);
grant select, delete on public.supplier_purchases to ledger_reset_executor;
create policy ledger_reset_cleanup on public.supplier_purchases for all to ledger_reset_executor using (true);
grant select, delete on public.supplier_write_offs to ledger_reset_executor;
create policy ledger_reset_cleanup on public.supplier_write_offs for all to ledger_reset_executor using (true);
grant select, delete on public.suppliers to ledger_reset_executor;
create policy ledger_reset_cleanup on public.suppliers for all to ledger_reset_executor using (true);

create function ledger_private.factory_reset_core(p_organization_id uuid, p_actor_id uuid, p_reset_settings boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  perform backup_private.prepare_factory_reset(p_organization_id);

  delete from public.customer_ledger_entries where organization_id = p_organization_id;
  get diagnostics v_customer_ledger_entries_cnt = row_count;
  delete from public.supplier_ledger_entries where organization_id = p_organization_id;
  get diagnostics v_supplier_ledger_entries_cnt = row_count;
  delete from ledger_private.customer_anchors where organization_id = p_organization_id;
  delete from ledger_private.supplier_anchors where organization_id = p_organization_id;

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
alter function ledger_private.factory_reset_core(uuid,uuid,boolean) owner to ledger_reset_executor;
revoke all on function ledger_private.factory_reset_core(uuid,uuid,boolean) from public, anon, authenticated, service_role;

create function ledger_private.factory_reset_owner(p_organization_id uuid, p_actor_id uuid, p_reset_settings boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if ledger_private.actor_id() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.profiles where id = ledger_private.actor_id()
    and organization_id = p_organization_id and role = 'owner'::public.user_role) then
    raise exception 'Not authorized to reset this organization';
  end if;
  return ledger_private.factory_reset_core(p_organization_id,p_actor_id,p_reset_settings);
end;
$$;
alter function ledger_private.factory_reset_owner(uuid,uuid,boolean) owner to ledger_reset_executor;
revoke all on function ledger_private.factory_reset_owner(uuid,uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function ledger_private.factory_reset_owner(uuid,uuid,boolean) to authenticated, service_role;

-- Retain the existing platform reset capability through an ACL, not a writable claim.
create function ledger_private.factory_reset_service(p_organization_id uuid, p_actor_id uuid, p_reset_settings boolean)
returns jsonb language sql security definer set search_path = '' as $$
  select ledger_private.factory_reset_core(p_organization_id,p_actor_id,p_reset_settings);
$$;
alter function ledger_private.factory_reset_service(uuid,uuid,boolean) owner to ledger_reset_executor;
revoke all on function ledger_private.factory_reset_service(uuid,uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function ledger_private.factory_reset_service(uuid,uuid,boolean) to service_role;

create or replace function public.reset_organization_to_factory_defaults(p_organization_id uuid, p_actor_id uuid, p_reset_settings boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'service_role' then
    return ledger_private.factory_reset_service(p_organization_id,p_actor_id,p_reset_settings);
  end if;
  return ledger_private.factory_reset_owner(p_organization_id,p_actor_id,p_reset_settings);
end;
$$;
revoke create on schema ledger_private from ledger_reset_executor;

commit;

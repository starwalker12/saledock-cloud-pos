-- Forward operational membership only. Production requires the fenced legacy
-- handover in docs/qa/atomic-cash-shift-cutover.md before this migration.
begin;
lock table public.profiles, public.staff_permissions, public.organizations,
  public.branches, public.customers, public.suppliers, public.products,
  public.product_stock_lots, public.invoices, public.invoice_items,
  public.invoice_item_stock_allocations, public.stock_movements, public.payments,
  public.credit_payments, public.customer_write_offs, public.returns,
  public.return_items, public.return_stock_allocations, public.expenses,
  public.cash_shifts, public.audit_logs, public.repairs, public.repair_status_history, public.supplier_purchases,
  public.supplier_purchase_items, public.supplier_payments,
  public.supplier_write_offs, backup_private.organization_identity_locks,
  backup_private.jobs, backup_private.staged_rows
  in access exclusive mode nowait;

do $$
begin
  if exists(select 1 from public.cash_shifts where status='open') then
    raise exception 'Legacy cash shifts require supervised handover before exact accounting activation.' using errcode='55000';
  end if;
  if exists(select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid
    join pg_catalog.pg_locks l on l.relation=t.tgrelid
    where l.pid=pg_backend_pid() and l.mode='AccessExclusiveLock' and l.granted and not t.tgisinternal
    and pg_catalog.pg_get_userbyid(p.proowner) not in
      ('postgres','supabase_admin','ledger_posting_executor','ledger_reset_executor',
       'backup_identity_executor','backup_import_executor')) then
    raise exception 'Unreviewed callback blocks cash shift cutover.' using errcode='42501';
  end if;
end; $$;

create role cash_shift_executor nologin nosuperuser nobypassrls;
create role expense_posting_executor nologin nosuperuser nobypassrls;
create role repair_posting_executor nologin nosuperuser nobypassrls;
grant cash_shift_executor, expense_posting_executor, repair_posting_executor to postgres;
create schema cash_private authorization cash_shift_executor;
revoke all on schema cash_private from public, anon, authenticated, service_role;
grant usage on schema cash_private to authenticated, ledger_posting_executor,
  ledger_reset_executor, backup_import_executor, backup_identity_executor, expense_posting_executor, repair_posting_executor;
-- Ownership transfer needs CREATE during this transaction only.
grant create on schema cash_private to backup_identity_executor,expense_posting_executor,repair_posting_executor;
grant usage on schema public to cash_shift_executor, expense_posting_executor, repair_posting_executor;
grant execute on function public.current_organization_id() to cash_shift_executor, expense_posting_executor, repair_posting_executor;

create function cash_private.actor_id() returns uuid
language sql stable security invoker set search_path=''
begin atomic select auth.uid(); end;
alter function cash_private.actor_id() owner to cash_shift_executor;
revoke all on function cash_private.actor_id() from public, anon, authenticated, service_role;
grant execute on function cash_private.actor_id() to backup_identity_executor, expense_posting_executor, repair_posting_executor;

create table cash_private.branch_boundaries (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid primary key references public.branches(id) on delete cascade,
  epoch bigint not null default 0 check(epoch>=0),
  unique(organization_id,branch_id)
);
alter table cash_private.branch_boundaries owner to backup_identity_executor;
alter table cash_private.branch_boundaries enable row level security;
revoke all on cash_private.branch_boundaries from public,anon,authenticated,service_role;
insert into cash_private.branch_boundaries(organization_id,branch_id)
select organization_id,id from public.branches;
grant select(id,organization_id,branch_id,is_active) on public.profiles to backup_identity_executor;
grant select(id,organization_id,is_active) on public.branches to backup_identity_executor;
create policy cash_metadata_profile on public.profiles for select to backup_identity_executor
  using(id=cash_private.actor_id());
create policy cash_metadata_branch on public.branches for select to backup_identity_executor
  using(organization_id=public.current_organization_id());

create function cash_private.maintenance_shared(p_org uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare before_epoch bigint; after_epoch bigint;
begin
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'Cash shift writers require READ COMMITTED.' using errcode='25000';
  end if;
  if not exists(select 1 from public.profiles where id=cash_private.actor_id()
    and organization_id=p_org and is_active) then
    raise exception 'No active profile for this organization.' using errcode='42501';
  end if;
  select epoch into before_epoch from backup_private.organization_identity_locks where organization_id=p_org;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(p_org::text,24637));
  select epoch into after_epoch from backup_private.organization_identity_locks where organization_id=p_org;
  if before_epoch is null or before_epoch is distinct from after_epoch then
    raise exception 'Factory Reset invalidated this pending operation. Refresh before continuing.' using errcode='55000';
  end if;
  if not exists(select 1 from public.profiles where id=cash_private.actor_id()
    and organization_id=p_org and is_active) then
    raise exception 'Authorization changed.' using errcode='42501';
  end if;
end; $$;
alter function cash_private.maintenance_shared(uuid) owner to backup_identity_executor;

create function cash_private.reset_lock(p_org uuid) returns void
language plpgsql volatile security definer set search_path='' set lock_timeout='250ms' as $$
begin
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'Factory Reset requires READ COMMITTED.' using errcode='25000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,24637));
exception when lock_not_available then
  raise exception 'Accounting is busy. Please retry Factory Reset.' using errcode='PT409';
end;
$$;
alter function cash_private.reset_lock(uuid) owner to backup_identity_executor;
revoke all on function cash_private.reset_lock(uuid) from public,anon,authenticated,service_role;
grant execute on function cash_private.reset_lock(uuid) to ledger_reset_executor;

create function cash_private.boundary(p_org uuid,p_branch uuid,p_exclusive boolean) returns bigint
language plpgsql volatile security definer set search_path='' as $$
declare v_epoch bigint;
begin
  perform cash_private.maintenance_shared(p_org);
  if not exists(select 1 from public.branches where id=p_branch and organization_id=p_org) then
    raise exception 'Branch not available.' using errcode='42501';
  end if;
  if p_exclusive then
    select epoch into v_epoch from cash_private.branch_boundaries
      where organization_id=p_org and branch_id=p_branch for update;
  else
    select epoch into v_epoch from cash_private.branch_boundaries
      where organization_id=p_org and branch_id=p_branch for share;
  end if;
  if not found then raise exception 'Cash boundary unavailable.' using errcode='55000'; end if;
  -- Fresh post-wait actor/scope validation; callers recheck their own permissions.
  perform cash_private.maintenance_shared(p_org);
  return v_epoch;
end; $$;
alter function cash_private.boundary(uuid,uuid,boolean) owner to backup_identity_executor;

create function cash_private.advance_boundary(p_org uuid,p_branch uuid) returns bigint
language plpgsql volatile security definer set search_path='' as $$
declare v_epoch bigint;
begin
  -- Caller has already acquired exclusive admission before any shift mutation.
  update cash_private.branch_boundaries set epoch=epoch+1
    where organization_id=p_org and branch_id=p_branch returning epoch into v_epoch;
  if not found then raise exception 'Cash boundary unavailable.' using errcode='55000'; end if;
  return v_epoch;
end; $$;
alter function cash_private.advance_boundary(uuid,uuid) owner to backup_identity_executor;
revoke all on function cash_private.advance_boundary(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function cash_private.advance_boundary(uuid,uuid) to cash_shift_executor;

create function cash_private.provision_boundary() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into cash_private.branch_boundaries(organization_id,branch_id) values(new.organization_id,new.id);
  return new;
end; $$;
alter function cash_private.provision_boundary() owner to backup_identity_executor;
revoke all on function cash_private.provision_boundary() from public,anon,authenticated,service_role;
create trigger provision_cash_boundary after insert on public.branches
for each row execute function cash_private.provision_boundary();

create function cash_private.guard_branch_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id then
      raise exception 'Branch accounting identity is immutable.' using errcode='42501';
    end if;
    return new;
  end if;
  -- An administrative delete may already own its branch tuple. Never WAIT for
  -- admission from this callback: abort rather than invert the producer order.
  if not pg_catalog.pg_try_advisory_xact_lock_shared(pg_catalog.hashtextextended(old.organization_id::text,24637)) then
    raise exception 'Branch accounting is busy.' using errcode='PT409';
  end if;
  perform 1 from cash_private.branch_boundaries where branch_id=old.id for update nowait;
  return old;
end; $$;
alter function cash_private.guard_branch_identity() owner to backup_identity_executor;
revoke all on function cash_private.guard_branch_identity() from public,anon,authenticated,service_role;
create trigger cash_branch_identity_guard before update or delete on public.branches
for each row execute function cash_private.guard_branch_identity();

alter table public.cash_shifts
  add column accounting_version smallint check(accounting_version is null or accounting_version=2),
  add column open_request_key uuid,
  add column open_request_payload jsonb,
  add column close_request_key uuid,
  add column close_request_payload jsonb,
  add column close_snapshot jsonb,
  add column close_audit_id uuid references public.audit_logs(id) on delete restrict,
  add column boundary_epoch bigint,
  add constraint cash_shift_exact_state check(accounting_version is null or
    (open_request_key is not null and open_request_payload is not null and boundary_epoch is not null
     and (status='open' or (closed_at is not null and closed_by is not null and counted_cash is not null
       and close_request_key is not null and close_request_payload is not null and close_snapshot is not null
       and close_audit_id is not null)))),
  add constraint cash_shift_membership_identity unique(organization_id,branch_id,id);
drop index public.idx_cash_shifts_one_open_per_branch;
create unique index idx_cash_shifts_one_open_per_branch on public.cash_shifts(organization_id,branch_id)
  where status='open' and accounting_version=2;
create unique index cash_shift_open_request on public.cash_shifts(organization_id,open_request_key)
  where open_request_key is not null;
create unique index cash_shift_close_request on public.cash_shifts(organization_id,close_request_key)
  where close_request_key is not null;

do $$
declare t text;
begin
  foreach t in array array['invoices','payments','returns','expenses','credit_payments','customer_write_offs'] loop
    execute format('alter table public.%I add column cash_shift_id uuid, add column cash_shift_assignment_xid xid8,
      add constraint %I check(cash_shift_id is null or (cash_shift_assignment_xid is not null and branch_id is not null)),
      add constraint %I foreign key(organization_id,branch_id,cash_shift_id)
        references public.cash_shifts(organization_id,branch_id,id) on delete restrict',t,t||'_cash_assignment',t||'_cash_membership');
    execute format('create index %I on public.%I(cash_shift_id) where cash_shift_id is not null',t||'_cash_members',t);
  end loop;
end; $$;
alter table public.credit_payments add column request_key uuid, add column request_payload jsonb;
alter table public.customer_write_offs add column request_key uuid, add column request_payload jsonb;
alter table public.returns add column idempotency_key text, add column request_payload jsonb;
alter table public.expenses add column create_request_key uuid, add column create_request_payload jsonb,
  add column revision bigint not null default 0 check(revision>=0);
create unique index cash_credit_request on public.credit_payments(organization_id,request_key) where request_key is not null;
create unique index cash_writeoff_request on public.customer_write_offs(organization_id,request_key) where request_key is not null;
create unique index cash_return_request on public.returns(organization_id,idempotency_key) where idempotency_key is not null;
create unique index cash_expense_request on public.expenses(organization_id,create_request_key) where create_request_key is not null;

create function cash_private.admit(p_org uuid,p_branch uuid) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare v_shift uuid;
begin
  if p_branch is null then perform cash_private.maintenance_shared(p_org); return null; end if;
  perform cash_private.boundary(p_org,p_branch,false);
  select id into v_shift from public.cash_shifts
    where organization_id=p_org and branch_id=p_branch and accounting_version=2 and status='open';
  return v_shift;
end; $$;
alter function cash_private.admit(uuid,uuid) owner to cash_shift_executor;
grant select on public.cash_shifts to cash_shift_executor;
create policy cash_executor_shift on public.cash_shifts for all to cash_shift_executor
  using(organization_id=public.current_organization_id()) with check(organization_id=public.current_organization_id());

create function cash_private.guard_source() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_shift uuid; v_invoice public.invoices%rowtype; v_closed boolean;
begin
  if tg_op='DELETE' then
    if current_user<>'ledger_reset_executor' then raise exception 'Financial membership cannot be deleted.' using errcode='42501'; end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    if new.cash_shift_id is distinct from old.cash_shift_id or new.cash_shift_assignment_xid is distinct from old.cash_shift_assignment_xid
      or (old.cash_shift_assignment_xid is not null and
        (new.organization_id is distinct from old.organization_id or new.branch_id is distinct from old.branch_id or new.id is distinct from old.id)) then
      raise exception 'Cash shift assignment is immutable.' using errcode='42501';
    end if;
    if tg_table_name='expenses' then
      if current_user<>'expense_posting_executor' then raise exception 'Use the approved expense writer.' using errcode='42501'; end if;
      if old.cash_shift_id is not null then
        select status='closed' into v_closed from public.cash_shifts where id=old.cash_shift_id;
        if v_closed and (to_jsonb(new)-array['notes','updated_at','revision'])
          is distinct from (to_jsonb(old)-array['notes','updated_at','revision']) then
          raise exception 'This expense belongs to a closed cash shift and its financial details can no longer be changed.' using errcode='PT409';
        end if;
      end if;
    elsif tg_table_name='returns' then
      if current_user<>'ledger_posting_executor' or old.cash_shift_assignment_xid is distinct from pg_catalog.pg_current_xact_id()
        or (to_jsonb(new)-array['subtotal','refund_amount','updated_at'])
          is distinct from (to_jsonb(old)-array['subtotal','refund_amount','updated_at']) then
        raise exception 'Committed Return evidence is immutable.' using errcode='42501';
      end if;
    end if;
    return new;
  end if;
  if current_user='backup_import_executor' then
    new.cash_shift_id:=null; new.cash_shift_assignment_xid:=null;
    if tg_table_name in ('credit_payments','customer_write_offs') then new.request_key:=null;new.request_payload:=null;
    elsif tg_table_name='returns' then new.idempotency_key:=null;new.request_payload:=null;
    elsif tg_table_name='expenses' then new.create_request_key:=null;new.create_request_payload:=null;new.revision:=0;
    end if;
    return new;
  end if;
  if new.cash_shift_id is not null or new.cash_shift_assignment_xid is not null then
    raise exception 'Cash assignment is database-owned.' using errcode='42501';
  end if;
  if current_user in ('postgres','supabase_admin') then return new; end if;
  if (tg_table_name='expenses' and current_user<>'expense_posting_executor')
    or (tg_table_name<>'expenses' and current_user<>'ledger_posting_executor') then
    raise exception 'Use an approved financial writer.' using errcode='42501';
  end if;
  -- Approved RPCs take admission before business locks. This reentrant check is defense in depth.
  v_shift:=cash_private.admit(new.organization_id,new.branch_id);
  if tg_table_name='payments' then
    select * into v_invoice from public.invoices where id=new.invoice_id;
    if v_invoice.cash_shift_assignment_xid is distinct from pg_catalog.pg_current_xact_id()
      or v_invoice.cash_shift_id is distinct from v_shift then
      raise exception 'Receipt assignment must match its invoice transaction.' using errcode='42501';
    end if;
  end if;
  new.cash_shift_id:=v_shift;new.cash_shift_assignment_xid:=pg_catalog.pg_current_xact_id();
  return new;
end; $$;
alter function cash_private.guard_source() owner to cash_shift_executor;
revoke all on function cash_private.guard_source() from public,anon,authenticated,service_role;
do $$
declare t text; cols text;
begin
  foreach t in array array['invoices','payments','returns','expenses','credit_payments','customer_write_offs'] loop
    execute format('create trigger cash_membership_guard before insert or update or delete on public.%I
      for each row execute function cash_private.guard_source()',t);
    execute format('revoke insert,update,delete,truncate,references,trigger on public.%I from public,anon,authenticated,service_role',t);
    select string_agg(quote_ident(attname),',') into cols from pg_catalog.pg_attribute
      where attrelid=('public.'||t)::regclass and attnum>0 and not attisdropped;
    execute format('revoke insert(%s),update(%s),references(%s) on public.%I from public,anon,authenticated,service_role',cols,cols,cols,t);
  end loop;
end; $$;

create function cash_private.guard_shift() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then
    if current_user<>'ledger_reset_executor' then raise exception 'Cash shifts cannot be deleted.' using errcode='42501'; end if;
    return old;
  end if;
  if tg_op='INSERT' and current_user='backup_import_executor' then
    new.accounting_version:=null;new.open_request_key:=null;new.open_request_payload:=null;
    new.close_request_key:=null;new.close_request_payload:=null;new.close_audit_id:=null;new.boundary_epoch:=null;
    return new;
  end if;
  if tg_op='INSERT' and current_user in ('postgres','supabase_admin') and new.accounting_version is null then return new; end if;
  if current_user<>'cash_shift_executor' then raise exception 'Use the approved cash shift writer.' using errcode='42501'; end if;
  if tg_op='UPDATE' and (old.status='closed' or old.accounting_version is distinct from 2
    or new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
    or new.branch_id is distinct from old.branch_id or new.accounting_version is distinct from old.accounting_version
    or new.open_request_key is distinct from old.open_request_key or new.open_request_payload is distinct from old.open_request_payload
    or new.starting_cash is distinct from old.starting_cash or new.opened_at is distinct from old.opened_at
    or new.opened_by is distinct from old.opened_by or new.status<>'closed') then
    raise exception 'Cash shift snapshot is immutable.' using errcode='42501';
  end if;
  return new;
end; $$;
alter function cash_private.guard_shift() owner to cash_shift_executor;
revoke all on function cash_private.guard_shift() from public,anon,authenticated,service_role;
create trigger cash_shift_write_guard before insert or update or delete on public.cash_shifts
for each row execute function cash_private.guard_shift();
revoke insert,update,delete,truncate,references,trigger on public.cash_shifts from public,anon,authenticated,service_role;
grant insert,update on public.cash_shifts to cash_shift_executor;
grant insert on public.audit_logs to cash_shift_executor,expense_posting_executor;
grant select on public.profiles to cash_shift_executor,expense_posting_executor;
grant select(id,organization_id,is_active) on public.branches to cash_shift_executor;
grant select(id,currency_code,currency_locked_at) on public.organizations to cash_shift_executor;
grant select(id,status) on public.cash_shifts to expense_posting_executor;
create policy cash_expense_shift_read on public.cash_shifts for select to expense_posting_executor using(organization_id=public.current_organization_id());
create policy cash_executor_profiles on public.profiles for select to cash_shift_executor using(organization_id=public.current_organization_id());
create policy cash_executor_branches on public.branches for select to cash_shift_executor using(organization_id=public.current_organization_id());
create policy cash_executor_org on public.organizations for select to cash_shift_executor using(id=public.current_organization_id());
create policy expense_executor_profiles on public.profiles for select to expense_posting_executor using(organization_id=public.current_organization_id());
create policy cash_executor_audit on public.audit_logs for all to cash_shift_executor
  using(organization_id=public.current_organization_id()) with check(organization_id=public.current_organization_id());
create policy expense_executor_audit on public.audit_logs for all to expense_posting_executor
  using(organization_id=public.current_organization_id()) with check(organization_id=public.current_organization_id());
grant select,insert,update on public.expenses to expense_posting_executor;
create policy expense_executor_write on public.expenses for all to expense_posting_executor
  using(organization_id=public.current_organization_id()) with check(organization_id=public.current_organization_id());
grant select(id,organization_id,branch_id,cash_shift_id,status,grand_total,balance_due) on public.invoices to cash_shift_executor;
grant select(id,organization_id,branch_id,cash_shift_id,amount,method,received_by) on public.payments to cash_shift_executor;
grant select(id,organization_id,branch_id,cash_shift_id,status,refund_amount,refund_method) on public.returns to cash_shift_executor;
grant select(id,organization_id,branch_id,cash_shift_id,status,category,amount,payment_method) on public.expenses to cash_shift_executor;
grant select(id,organization_id,branch_id,cash_shift_id,amount,method) on public.credit_payments to cash_shift_executor;
grant select(id,organization_id,branch_id,cash_shift_id,amount) on public.customer_write_offs to cash_shift_executor;
do $$
declare t text;
begin
  foreach t in array array['invoices','payments','returns','expenses','credit_payments','customer_write_offs'] loop
    execute format('create policy cash_executor_read on public.%I for select to cash_shift_executor using(organization_id=public.current_organization_id())',t);
  end loop;
end; $$;

create function cash_private.authorize_shift() returns public.profiles
language plpgsql stable security invoker set search_path='' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id=cash_private.actor_id() and is_active;
  if not found or p.role not in ('owner','admin','manager') or p.organization_id is null or p.branch_id is null
    or not exists(select 1 from public.branches where id=p.branch_id and organization_id=p.organization_id and is_active) then
    raise exception 'You do not have permission to manage this cash shift.' using errcode='42501';
  end if;
  return p;
end; $$;
alter function cash_private.authorize_shift() owner to cash_shift_executor;

create function cash_private.money(p_value text,p_positive boolean default false) returns numeric
language plpgsql immutable security invoker set search_path='' as $$
declare n numeric; normalized text:=btrim(p_value);
begin
  if normalized is null or normalized !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' then
    raise exception 'Enter a valid cash amount with at most two decimals.' using errcode='22023';
  end if;
  n:=normalized::numeric;
  if n<>round(n,2) then raise exception 'Enter a valid cash amount with at most two decimals.' using errcode='22023'; end if;
  if n<0 or n>9999999999.99 or (p_positive and n<=0) then raise exception 'Cash amount is outside the supported money domain.' using errcode='22003'; end if;
  -- Validation above rejects real sub-cent values before canonical scale coercion.
  return n::numeric(12,2);
end; $$;
alter function cash_private.money(text,boolean) owner to cash_shift_executor;

-- The job is long lived; only its single V1 advance receipt has membership.
alter table public.repairs
  add column advance_cash_shift_id uuid,
  add column advance_cash_shift_assignment_xid xid8,
  add column advance_received_at timestamptz,
  add column advance_received_by uuid references public.profiles(id) on delete restrict,
  add column repair_revision bigint not null default 0 check(repair_revision>=0),
  add column repair_request_key uuid,
  add column repair_request_payload jsonb,
  add constraint repair_advance_assignment check(
    (advance_cash_shift_assignment_xid is null and advance_cash_shift_id is null and advance_received_at is null and advance_received_by is null)
    or (advance_cash_shift_assignment_xid is not null and advance_received_at is not null and advance_received_by is not null)),
  add constraint repair_advance_membership foreign key(organization_id,branch_id,advance_cash_shift_id)
    references public.cash_shifts(organization_id,branch_id,id) on delete restrict;
create index repair_advance_members on public.repairs(advance_cash_shift_id) where advance_cash_shift_id is not null;
create unique index repair_create_request on public.repairs(organization_id,repair_request_key) where repair_request_key is not null;

grant select(id),update(id) on public.organizations to repair_posting_executor;
create policy repair_executor_org on public.organizations for all to repair_posting_executor using(id=public.current_organization_id()) with check(id=public.current_organization_id());
grant select,insert,update on public.repairs to repair_posting_executor;
grant select on public.profiles to repair_posting_executor;
grant select(id,organization_id,is_active) on public.branches to repair_posting_executor;
grant select(id,organization_id) on public.customers to repair_posting_executor;
grant insert on public.audit_logs,public.repair_status_history to repair_posting_executor;
grant select(id,status) on public.cash_shifts to repair_posting_executor;
create policy repair_executor_write on public.repairs for all to repair_posting_executor
 using(organization_id=public.current_organization_id()) with check(organization_id=public.current_organization_id());
create policy repair_executor_profile on public.profiles for select to repair_posting_executor using(organization_id=public.current_organization_id());
create policy repair_executor_branch on public.branches for select to repair_posting_executor using(organization_id=public.current_organization_id());
create policy repair_executor_customer on public.customers for select to repair_posting_executor using(organization_id=public.current_organization_id());
create policy repair_executor_shift on public.cash_shifts for select to repair_posting_executor using(organization_id=public.current_organization_id());
create policy repair_executor_audit on public.audit_logs for insert to repair_posting_executor with check(organization_id=public.current_organization_id());
create policy repair_executor_history on public.repair_status_history for insert to repair_posting_executor with check(organization_id=public.current_organization_id());

create function cash_private.guard_repair_advance() returns trigger
language plpgsql security invoker set search_path='' as $$
declare financial_change boolean; actor public.profiles;
begin
 if tg_op='DELETE' then
   if current_user<>'ledger_reset_executor' then raise exception 'Repair receipt history cannot be deleted.' using errcode='42501'; end if;
   return old;
 end if;
 if tg_op='INSERT' and current_user='backup_import_executor' then
   new.advance_cash_shift_id:=null;new.advance_cash_shift_assignment_xid:=null;
   new.advance_received_at:=null;new.advance_received_by:=null;
   new.repair_request_key:=null;new.repair_request_payload:=null;new.repair_revision:=0;
   return new;
 end if;
 if tg_op='INSERT' then
   if new.advance_cash_shift_id is not null or new.advance_cash_shift_assignment_xid is not null
      or new.advance_received_at is not null or new.advance_received_by is not null then
     raise exception 'Repair advance assignment is database-owned.' using errcode='42501'; end if;
   if current_user in ('postgres','supabase_admin') then return new; end if;
   if current_user<>'repair_posting_executor' then raise exception 'Use the approved repair writer.' using errcode='42501'; end if;
   financial_change:=new.advance_paid>0;
 else
   if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id or new.branch_id is distinct from old.branch_id
      or new.job_no is distinct from old.job_no or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
      or new.repair_request_key is distinct from old.repair_request_key or new.repair_request_payload is distinct from old.repair_request_payload
      or new.advance_cash_shift_id is distinct from old.advance_cash_shift_id
      or new.advance_cash_shift_assignment_xid is distinct from old.advance_cash_shift_assignment_xid
      or new.advance_received_at is distinct from old.advance_received_at or new.advance_received_by is distinct from old.advance_received_by
      or new.repair_revision is distinct from old.repair_revision then
     raise exception 'Repair advance identity is immutable.' using errcode='42501'; end if;
   financial_change:=new.advance_paid is distinct from old.advance_paid or new.payment_method is distinct from old.payment_method;
   if current_user<>'repair_posting_executor' then
     if financial_change then raise exception 'Use the approved repair writer.' using errcode='42501'; end if;
     -- A raw workflow update already owns its tuple. Never wait for M from here.
     if not pg_catalog.pg_try_advisory_xact_lock_shared(pg_catalog.hashtextextended(old.organization_id::text,24637)) then
       raise exception 'Accounting is busy. Refresh and try again.' using errcode='PT409'; end if;
     select * into actor from public.profiles where id=auth.uid() and is_active and organization_id=old.organization_id and branch_id=old.branch_id;
     if not found or actor.role not in ('owner','admin','manager','technician') then
       raise exception 'You do not have permission to update this repair.' using errcode='42501'; end if;
     if actor.role='technician' and (to_jsonb(new)-array['diagnosis','status','notes','final_cost','delivered_at','updated_at'])
       is distinct from (to_jsonb(old)-array['diagnosis','status','notes','final_cost','delivered_at','updated_at']) then
       raise exception 'You do not have permission to edit repair details.' using errcode='42501'; end if;
   end if;
   if financial_change and old.advance_cash_shift_id is not null and exists(
     select 1 from public.cash_shifts where id=old.advance_cash_shift_id and status='closed') then
     raise exception 'This repair advance belongs to a closed cash shift and can no longer be changed.' using errcode='PT409'; end if;
   if financial_change and old.advance_cash_shift_assignment_xid is null and old.advance_paid>0 then
     raise exception 'Legacy repair advance history cannot be rewritten.' using errcode='PT409'; end if;
   new.repair_revision:=old.repair_revision+1;
 end if;
 if new.advance_paid::text in ('NaN','Infinity','-Infinity') or new.advance_paid<0 or new.payment_method='customer_credit' then
   raise exception 'Invalid repair advance.' using errcode='22023'; end if;
 if current_user='repair_posting_executor' and new.advance_paid>0 and new.advance_cash_shift_assignment_xid is null
    and (tg_op='INSERT' or old.advance_paid=0) then
   -- RPC has admission before its first business lock. Trigger is reentrant.
   new.advance_cash_shift_id:=cash_private.admit(new.organization_id,new.branch_id);
   new.advance_cash_shift_assignment_xid:=pg_catalog.pg_current_xact_id();
   new.advance_received_at:=clock_timestamp();new.advance_received_by:=cash_private.actor_id();
 end if;
 return new;
end; $$;
alter function cash_private.guard_repair_advance() owner to repair_posting_executor;
revoke all on function cash_private.guard_repair_advance() from public,anon,authenticated,service_role;
create trigger repair_advance_guard before insert or update or delete on public.repairs
 for each row execute function cash_private.guard_repair_advance();
revoke insert,update,delete,truncate,references,trigger on public.repairs from public,anon,authenticated,service_role;
do $$ declare cols text; begin
 select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.repairs'::regclass and attnum>0 and not attisdropped;
 execute format('revoke insert(%s),update(%s),references(%s) on public.repairs from public,anon,authenticated,service_role',cols,cols,cols);
end; $$;
-- Operational workflow remains available under its existing role checks. No raw receipt economics.
grant update(diagnosis,status,notes,final_cost,delivered_at,updated_at) on public.repairs to authenticated;

create function cash_private.save_repair(p_id uuid,p_key uuid,p_revision bigint,p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor public.profiles; original public.repairs; saved public.repairs; data public.repairs;
 payload jsonb; seq numeric; seq_text text;
begin
 select * into actor from public.profiles where id=cash_private.actor_id() and is_active;
 if not found or actor.organization_id is null or actor.branch_id is null
   or (p_id is null and actor.role not in ('owner','admin','manager','cashier','technician'))
   or (p_id is not null and actor.role not in ('owner','admin','manager')) then
   raise exception 'You do not have permission to save this repair.' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or exists(select 1 from jsonb_object_keys(p_data) k
    where k<>all(array['customer_id','customer_name','customer_phone','device_type','device_model','serial_imei','problem_description',
      'accessories_received','estimated_cost','advance_paid','payment_method','status','notes','expected_delivery_at'])) then
   raise exception 'Invalid repair details.' using errcode='22023'; end if;
 select * into data from jsonb_populate_record(null::public.repairs,p_data);
 data.advance_paid:=cash_private.money(p_data->>'advance_paid');
 data.estimated_cost:=cash_private.money(p_data->>'estimated_cost');
 if data.payment_method is null or data.payment_method='customer_credit' or data.status is null
    or nullif(btrim(data.customer_name),'') is null or length(btrim(data.customer_name))>160
    or nullif(btrim(data.device_type),'') is null or length(btrim(data.device_type))>100
    or nullif(btrim(data.problem_description),'') is null then
   raise exception 'Invalid repair details.' using errcode='22023'; end if;
 -- All saves acquire M/B before the organization counter or repair tuple.
 perform cash_private.boundary(actor.organization_id,actor.branch_id,false);
 if not exists(select 1 from public.profiles where id=actor.id and organization_id=actor.organization_id and branch_id=actor.branch_id
    and is_active and role=actor.role) or not exists(select 1 from public.branches where id=actor.branch_id and organization_id=actor.organization_id and is_active) then
   raise exception 'Repair authorization changed.' using errcode='42501'; end if;
 if data.customer_id is not null and not exists(select 1 from public.customers where id=data.customer_id and organization_id=actor.organization_id) then
   raise exception 'The selected customer is unavailable.' using errcode='42501'; end if;
 payload:=jsonb_build_object('branch',actor.branch_id,'data',p_data||jsonb_build_object('advance_paid',data.advance_paid,'estimated_cost',data.estimated_cost));
 if p_id is null then
   if p_key is null then raise exception 'Refresh and try again with a request key.' using errcode='22023'; end if;
   -- Reuse the existing organization/counter order; SQL max has no API row cap.
   perform 1 from public.organizations where id=actor.organization_id for update;
   select * into saved from public.repairs where organization_id=actor.organization_id and repair_request_key=p_key;
   if found then
     if saved.repair_request_payload is distinct from payload then raise exception 'Conflicting repair request.' using errcode='PT409'; end if;
     return jsonb_build_object('id',saved.id,'job_no',saved.job_no,'revision',saved.repair_revision,'replayed',true);
   end if;
   select coalesce(max(nullif(regexp_replace(job_no,'\D','','g'),'')::numeric),0)+1 into seq from public.repairs where organization_id=actor.organization_id;
   seq_text:=seq::text;
   insert into public.repairs(organization_id,branch_id,customer_id,job_no,customer_name,customer_phone,device_type,device_model,serial_imei,
     problem_description,accessories_received,estimated_cost,advance_paid,payment_method,final_cost,status,notes,expected_delivery_at,created_by,
     repair_request_key,repair_request_payload,repair_revision)
   values(actor.organization_id,actor.branch_id,data.customer_id,'RJ-'||case when length(seq_text)<6 then lpad(seq_text,6,'0') else seq_text end,
     btrim(data.customer_name),data.customer_phone,btrim(data.device_type),data.device_model,data.serial_imei,data.problem_description,
     data.accessories_received,data.estimated_cost,data.advance_paid,data.payment_method,data.estimated_cost,data.status,data.notes,data.expected_delivery_at,
     actor.id,p_key,payload,1) returning * into saved;
   insert into public.repair_status_history(organization_id,repair_id,old_status,new_status,note,changed_by)
     values(actor.organization_id,saved.id,null,saved.status,coalesce(data.notes,'Device received for repair intake.'),actor.id);
 else
   select * into original from public.repairs where id=p_id and organization_id=actor.organization_id and branch_id=actor.branch_id for update;
   if not found then raise exception 'Repair not found for this branch.' using errcode='42501'; end if;
   if row(original.customer_id,original.customer_name,original.customer_phone,original.device_type,original.device_model,original.serial_imei,
      original.problem_description,original.accessories_received,original.estimated_cost,original.advance_paid,original.payment_method,
      original.status,original.notes,original.expected_delivery_at)
     is not distinct from row(data.customer_id,btrim(data.customer_name),data.customer_phone,btrim(data.device_type),data.device_model,data.serial_imei,
      data.problem_description,data.accessories_received,data.estimated_cost,data.advance_paid,data.payment_method,data.status,data.notes,data.expected_delivery_at) then
     return jsonb_build_object('id',original.id,'job_no',original.job_no,'revision',original.repair_revision,'replayed',true);
   end if;
   if p_revision is null or p_revision<>original.repair_revision then raise exception 'Repair changed; refresh before editing.' using errcode='PT409'; end if;
   update public.repairs set customer_id=data.customer_id,customer_name=btrim(data.customer_name),customer_phone=data.customer_phone,
     device_type=btrim(data.device_type),device_model=data.device_model,serial_imei=data.serial_imei,problem_description=data.problem_description,
     accessories_received=data.accessories_received,estimated_cost=data.estimated_cost,advance_paid=data.advance_paid,payment_method=data.payment_method,
     status=data.status,notes=data.notes,expected_delivery_at=data.expected_delivery_at where id=original.id returning * into saved;
 end if;
 insert into public.audit_logs(organization_id,branch_id,actor_id,module,action,details,metadata)
   values(actor.organization_id,actor.branch_id,actor.id,'repairs',case when p_id is null then 'repairs.created' else 'repairs.updated' end,
     'Repair saved',jsonb_build_object('repair_id',saved.id,'revision',saved.repair_revision,'advance_receipt',saved.advance_cash_shift_assignment_xid is not null));
 return jsonb_build_object('id',saved.id,'job_no',saved.job_no,'revision',saved.repair_revision,'replayed',false);
end; $$;
alter function cash_private.save_repair(uuid,uuid,bigint,jsonb) owner to repair_posting_executor;
create function public.save_cash_shift_repair(p_id uuid,p_request_key uuid,p_revision bigint,p_data jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$ select cash_private.save_repair(p_id,p_request_key,p_revision,p_data); $$;

grant select(id,organization_id,branch_id,advance_cash_shift_id,advance_cash_shift_assignment_xid,advance_paid,payment_method,advance_received_by) on public.repairs to cash_shift_executor;
create policy cash_executor_repair_read on public.repairs for select to cash_shift_executor using(organization_id=public.current_organization_id());

create function cash_private.aggregate_shift(p_shift uuid) returns jsonb
language sql volatile security invoker set search_path='' as $$
with target as materialized(select organization_id,branch_id from public.cash_shifts where id=p_shift),
i as (select count(*) n,coalesce(sum(grand_total),0) gross,coalesce(sum(balance_due),0) pending from public.invoices,target t
 where cash_shift_id=p_shift and invoices.organization_id=t.organization_id and invoices.branch_id=t.branch_id and status in ('paid','partial','unpaid')),
p as (select method::text method,sum(amount) amount,count(*) n from public.payments,target t
 where cash_shift_id=p_shift and payments.organization_id=t.organization_id and payments.branch_id=t.branch_id group by method),
r as (select coalesce(refund_method,'none') method,sum(refund_amount) amount,count(*) n from public.returns,target t
 where cash_shift_id=p_shift and returns.organization_id=t.organization_id and returns.branch_id=t.branch_id and status='completed' group by refund_method),
e as (select category,payment_method::text method,sum(amount) amount,count(*) n from public.expenses,target t
 where cash_shift_id=p_shift and expenses.organization_id=t.organization_id and expenses.branch_id=t.branch_id and status='active' group by category,payment_method),
c as (select method::text method,sum(amount) amount,count(*) n from public.credit_payments,target t
 where cash_shift_id=p_shift and credit_payments.organization_id=t.organization_id and credit_payments.branch_id=t.branch_id group by method),
w as (select coalesce(sum(amount),0) amount,count(*) n from public.customer_write_offs,target t
 where cash_shift_id=p_shift and customer_write_offs.organization_id=t.organization_id and customer_write_offs.branch_id=t.branch_id),
a as (select payment_method::text method,sum(advance_paid) amount,count(*) n from public.repairs,target t
 where advance_cash_shift_id=p_shift and advance_cash_shift_assignment_xid is not null and repairs.organization_id=t.organization_id and repairs.branch_id=t.branch_id group by payment_method),
asf as (select advance_received_by, sum(advance_paid) amount from public.repairs,target t
 where advance_cash_shift_id=p_shift and advance_cash_shift_assignment_xid is not null and repairs.organization_id=t.organization_id and repairs.branch_id=t.branch_id group by advance_received_by),
s as (select received_by,coalesce(sum(amount) filter(where method='cash'),0) cash,
 coalesce(sum(amount) filter(where method in ('card','easypaisa','jazzcash','bank_transfer','customer_credit')),0) digital
 from public.payments,target t where cash_shift_id=p_shift and payments.organization_id=t.organization_id and payments.branch_id=t.branch_id group by received_by)
select jsonb_build_object(
 'invoicesCount',i.n::text,'grossSales',i.gross::text,'creditPending',i.pending::text,
 'paymentsByMethod',coalesce((select jsonb_object_agg(method,amount::text) from p),'{}'),
 'paymentsTotal',coalesce((select sum(amount) from p),0)::text,
 'refundsCount',coalesce((select sum(n) from r),0)::text,
 'refundsByMethod',coalesce((select jsonb_object_agg(method,amount::text) from r where method<>'none'),'{}'),
 'refundsTotal',coalesce((select sum(amount) from r),0)::text,
 'expensesTotal',coalesce((select sum(amount) from e),0)::text,
 'expensesCash',coalesce((select sum(amount) from e where method='cash'),0)::text,
 'expensesByCategory',coalesce((select jsonb_agg(jsonb_build_object('category',category,'amount',amount::text) order by amount desc,category)
   from(select category,sum(amount) amount from e group by category) categories),'[]'),
 'creditCollectionCash',coalesce((select sum(amount) from c where method='cash'),0)::text,
 'creditCollectionDigital',coalesce((select sum(amount) from c where method in ('card','easypaisa','jazzcash','bank_transfer')),0)::text,
 'creditCollectionsByMethod',coalesce((select jsonb_object_agg(method,amount::text) from c),'{}'),
 'creditWriteOffs',w.amount::text,
 'repairAdvancesTotal',coalesce((select sum(amount) from a),0)::text,
 'repairAdvancesCash',coalesce((select sum(amount) from a where method='cash'),0)::text,
 'repairAdvancesByMethod',coalesce((select jsonb_object_agg(method,amount::text) from a),'{}'),
 'repairAdvancesByStaff',coalesce((select jsonb_agg(jsonb_build_object('user_id',asf.advance_received_by,'user_name',profiles.full_name,'amount',asf.amount::text) order by asf.amount desc,asf.advance_received_by) from asf left join public.profiles on profiles.id=asf.advance_received_by),'[]'),
 'expectedCash',(coalesce((select sum(amount) from p where method='cash'),0)
   -coalesce((select sum(amount) from r where method='cash'),0)
   -coalesce((select sum(amount) from e where method='cash'),0)
   +coalesce((select sum(amount) from c where method='cash'),0)
   +coalesce((select sum(amount) from a where method='cash'),0))::text,
 'staff',coalesce((select jsonb_agg(jsonb_build_object('user_id',coalesce(s.received_by::text,'unassigned'),
   'user_name',profiles.full_name,'role',profiles.role,'paymentsTotal',(s.cash+s.digital)::text,
   'paymentsCash',s.cash::text,'paymentsDigital',s.digital::text) order by s.cash+s.digital desc,s.received_by)
   from s left join public.profiles on profiles.id=s.received_by),'[]'),
 'sourceCounts',jsonb_build_object('invoices',i.n::text,'payments',coalesce((select sum(n) from p),0)::text,
   'returns',coalesce((select sum(n) from r),0)::text,'expenses',coalesce((select sum(n) from e),0)::text,
   'credit_payments',coalesce((select sum(n) from c),0)::text,'customer_write_offs',w.n::text,'repair_advances',coalesce((select sum(n) from a),0)::text),
 'snapshotObservedAt',clock_timestamp())
from i,w;
$$;
alter function cash_private.aggregate_shift(uuid) owner to cash_shift_executor;

create function cash_private.open_shift(p_key uuid,p_start text,p_notes text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor public.profiles:=cash_private.authorize_shift(); s public.cash_shifts;
  amount numeric:=cash_private.money(p_start); payload jsonb; epoch bigint; constraint_name text;
begin
  if p_key is null then raise exception 'Refresh and try again with a request key.' using errcode='22023'; end if;
  if length(coalesce(p_notes,''))>500 then raise exception 'Notes are too long.' using errcode='22023'; end if;
  payload:=jsonb_build_object('branch',actor.branch_id,'starting_cash',amount,'notes',nullif(btrim(p_notes),''));
  perform cash_private.boundary(actor.organization_id,actor.branch_id,true);
  if cash_private.authorize_shift() is distinct from actor then raise exception 'Authorization changed.' using errcode='42501'; end if;
  select * into s from public.cash_shifts where organization_id=actor.organization_id and open_request_key=p_key;
  if found then
    if s.open_request_payload is distinct from payload then raise exception 'Conflicting shift request.' using errcode='PT409'; end if;
    return jsonb_build_object('id',s.id,'replayed',true,'opened_at',s.opened_at);
  end if;
  if exists(select 1 from public.cash_shifts where organization_id=actor.organization_id and branch_id=actor.branch_id and status='open' and accounting_version=2) then
    raise exception 'A shift is already open for this branch. Close it first.' using errcode='PT409';
  end if;
  epoch:=cash_private.advance_boundary(actor.organization_id,actor.branch_id);
  insert into public.cash_shifts(organization_id,branch_id,opened_by,opened_at,starting_cash,notes,status,accounting_version,
    open_request_key,open_request_payload,boundary_epoch)
    values(actor.organization_id,actor.branch_id,actor.id,clock_timestamp(),amount,nullif(btrim(p_notes),''),'open',2,p_key,payload,epoch) returning * into s;
  insert into public.audit_logs(organization_id,branch_id,actor_id,module,action,details,metadata,created_at)
    values(actor.organization_id,actor.branch_id,actor.id,'cash_shift','cash_shift.opened','Cash drawer shift opened',
      jsonb_build_object('shift_id',s.id,'starting_cash',amount,'accounting_version',2),s.opened_at);
  return jsonb_build_object('id',s.id,'replayed',false,'opened_at',s.opened_at);
exception when unique_violation then
  get stacked diagnostics constraint_name=CONSTRAINT_NAME;
  if constraint_name='cash_shift_open_request' then raise exception 'Conflicting shift request.' using errcode='PT409'; end if;
  raise;
end; $$;
alter function cash_private.open_shift(uuid,text,text) owner to cash_shift_executor;

create function cash_private.close_shift(p_shift uuid,p_key uuid,p_counted text,p_notes text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor public.profiles:=cash_private.authorize_shift(); s public.cash_shifts; other_shift uuid;
  counted numeric:=cash_private.money(p_counted); expected numeric; difference numeric;
  payload jsonb; activity jsonb; boundary timestamptz; audit_id uuid:=gen_random_uuid(); epoch bigint; currency text; constraint_name text;
begin
  if p_key is null then raise exception 'Refresh and try again with a request key.' using errcode='22023'; end if;
  if length(coalesce(p_notes,''))>500 then raise exception 'Notes are too long.' using errcode='22023'; end if;
  payload:=jsonb_build_object('shift',p_shift,'counted_cash',counted,'notes',nullif(btrim(p_notes),''));
  perform cash_private.boundary(actor.organization_id,actor.branch_id,true);
  if cash_private.authorize_shift() is distinct from actor then raise exception 'Authorization changed.' using errcode='42501'; end if;
  select id into other_shift from public.cash_shifts where organization_id=actor.organization_id and close_request_key=p_key;
  if found and other_shift is distinct from p_shift then raise exception 'Conflicting shift request.' using errcode='PT409'; end if;
  select * into s from public.cash_shifts where id=p_shift and organization_id=actor.organization_id and branch_id=actor.branch_id for update;
  if not found then raise exception 'Shift not found for this branch.' using errcode='42501'; end if;
  if s.accounting_version is distinct from 2 then raise exception 'Legacy shift requires supervised handover.' using errcode='55000'; end if;
  if s.status='closed' then
    if s.close_request_key=p_key and s.close_request_payload=payload then
      return jsonb_build_object('id',s.id,'replayed',true,'closed_at',s.closed_at,'expected_cash',s.expected_cash::text,
        'counted_cash',s.counted_cash::text,'cash_difference',s.cash_difference::text,'audit_id',s.close_audit_id);
    end if;
    raise exception 'This shift is already closed or the request conflicts.' using errcode='PT409';
  end if;
  select currency_code into currency from public.organizations where id=actor.organization_id and currency_locked_at is not null;
  if not found then raise exception 'Cash shift currency evidence is unavailable.' using errcode='55000'; end if;
  boundary:=clock_timestamp();
  activity:=cash_private.aggregate_shift(s.id);
  expected:=s.starting_cash+(activity->>'expectedCash')::numeric;
  difference:=counted-expected;
  if expected not between -9999999999.99 and 9999999999.99 or difference not between -9999999999.99 and 9999999999.99 then
    raise exception 'Cash shift totals exceed the supported money domain. This shift was not closed.' using errcode='22003';
  end if;
  epoch:=cash_private.advance_boundary(actor.organization_id,actor.branch_id);
  activity:=activity||jsonb_build_object('version',2,'organization_id',actor.organization_id,'branch_id',actor.branch_id,
    'shift_id',s.id,'currency',currency,'closed_at',boundary,'closed_by',actor.id,
    'starting_cash',s.starting_cash::text,'expected_cash',expected::text,'counted_cash',counted::text,'cash_difference',difference::text);
  insert into public.audit_logs(id,organization_id,branch_id,actor_id,module,action,details,metadata,created_at)
    values(audit_id,actor.organization_id,actor.branch_id,actor.id,'cash_shift','cash_shift.closed','Cash drawer shift closed',
      jsonb_build_object('shift_id',s.id,'accounting_version',2,'expected_cash',expected::text,
        'counted_cash',counted::text,'cash_difference',difference::text,'request_key',p_key),boundary);
  update public.cash_shifts set closed_at=boundary,closed_by=actor.id,expected_cash=expected,counted_cash=counted,
    cash_difference=difference,notes=nullif(btrim(p_notes),''),status='closed',close_request_key=p_key,
    close_request_payload=payload,close_snapshot=activity,close_audit_id=audit_id,boundary_epoch=epoch where id=s.id;
  return jsonb_build_object('id',s.id,'replayed',false,'closed_at',boundary,'expected_cash',expected::text,
    'counted_cash',counted::text,'cash_difference',difference::text,'audit_id',audit_id);
exception when unique_violation then
  get stacked diagnostics constraint_name=CONSTRAINT_NAME;
  if constraint_name='cash_shift_close_request' then raise exception 'Conflicting shift request.' using errcode='PT409'; end if;
  raise;
end; $$;
alter function cash_private.close_shift(uuid,uuid,text,text) owner to cash_shift_executor;

create function cash_private.read_shift(p_shift uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; s public.cash_shifts;
begin
  select * into actor from public.profiles where id=cash_private.actor_id() and is_active;
  if not found or actor.organization_id is null or actor.branch_id is null then
    raise exception 'Shift not available.' using errcode='42501'; end if;
  select * into s from public.cash_shifts where id=p_shift and organization_id=actor.organization_id and branch_id=actor.branch_id;
  if not found then raise exception 'Shift not available.' using errcode='42501'; end if;
  if s.accounting_version is distinct from 2 then raise exception 'This is a legacy shift.' using errcode='55000'; end if;
  if s.status='closed' then return s.close_snapshot; end if;
  return cash_private.aggregate_shift(s.id)||jsonb_build_object('version',2,'live',true,'starting_cash',s.starting_cash::text);
end; $$;
alter function cash_private.read_shift(uuid) owner to cash_shift_executor;

create function public.open_cash_shift(p_request_key uuid,p_starting_cash text,p_notes text default null) returns jsonb
language sql volatile security invoker set search_path='' as $$ select cash_private.open_shift(p_request_key,p_starting_cash,p_notes); $$;
create function public.close_cash_shift(p_shift_id uuid,p_request_key uuid,p_counted_cash text,p_notes text default null) returns jsonb
language sql volatile security invoker set search_path='' as $$ select cash_private.close_shift(p_shift_id,p_request_key,p_counted_cash,p_notes); $$;
create function public.get_cash_shift_snapshot(p_shift_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select cash_private.read_shift(p_shift_id); $$;

create function cash_private.guard_close_audit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.cash_shifts where close_audit_id=old.id) then
    raise exception 'The authoritative cash shift close audit is immutable.' using errcode='42501';
  end if;
  if tg_op='UPDATE' then return new; end if;
  return old;
end; $$;
alter function cash_private.guard_close_audit() owner to backup_identity_executor;
revoke all on function cash_private.guard_close_audit() from public,anon,authenticated,service_role;
grant select(close_audit_id) on public.cash_shifts to backup_identity_executor;
create policy cash_audit_reference_read on public.cash_shifts for select to backup_identity_executor using(true);
create trigger cash_close_audit_guard before update or delete on public.audit_logs
for each row execute function cash_private.guard_close_audit();

create function cash_private.save_expense(p_id uuid,p_key uuid,p_revision bigint,p_category text,
  p_amount text,p_method public.payment_method,p_vendor text,p_notes text,p_spent_at timestamptz,
  p_operation text default 'save') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor public.profiles; original public.expenses; saved public.expenses;
  branch uuid; v_amount numeric; payload jsonb; desired_status public.expense_status;
begin
  select * into actor from public.profiles where id=cash_private.actor_id() and is_active;
  if not found or actor.organization_id is null or actor.branch_id is null or actor.role not in ('owner','admin','manager') then
    raise exception 'You do not have permission to manage expenses.' using errcode='42501';
  end if;
  if p_operation not in ('save','void','restore') or (p_id is null and p_operation<>'save') then
    raise exception 'Invalid expense operation.' using errcode='22023';
  end if;
  if p_id is null then branch:=actor.branch_id;
  else
    select * into original from public.expenses where id=p_id and organization_id=actor.organization_id;
    if not found then raise exception 'Expense not found.' using errcode='42501'; end if;
    branch:=original.branch_id;
  end if;
  perform cash_private.boundary(actor.organization_id,branch,false);
  if not exists(select 1 from public.profiles where id=actor.id and is_active and organization_id=actor.organization_id
    and branch_id=actor.branch_id and role=actor.role) then raise exception 'Authorization changed.' using errcode='42501'; end if;
  if p_operation='save' then
    v_amount:=cash_private.money(p_amount,true);
    if p_method is null or p_method='customer_credit' or nullif(btrim(p_category),'') is null or length(btrim(p_category))>80 then
      raise exception 'Invalid expense details.' using errcode='22023';
    end if;
  end if;
  if p_id is null then
    if p_key is null then raise exception 'Refresh and try again with a request key.' using errcode='22023'; end if;
    payload:=jsonb_build_object('branch',branch,'category',btrim(p_category),'amount',v_amount,'method',p_method,
      'vendor',nullif(btrim(p_vendor),''),'notes',nullif(btrim(p_notes),''),'spent_at',p_spent_at);
    select * into saved from public.expenses where organization_id=actor.organization_id and create_request_key=p_key;
    if found then
      if saved.create_request_payload is distinct from payload then raise exception 'Conflicting expense request.' using errcode='PT409'; end if;
      return jsonb_build_object('id',saved.id,'revision',saved.revision,'replayed',true);
    end if;
    insert into public.expenses(organization_id,branch_id,category,amount,payment_method,vendor_name,notes,spent_at,created_by,
      status,create_request_key,create_request_payload,revision)
      values(actor.organization_id,branch,btrim(p_category),v_amount,p_method,nullif(btrim(p_vendor),''),nullif(btrim(p_notes),''),
        coalesce(p_spent_at,clock_timestamp()),actor.id,'active',p_key,payload,1)
      on conflict(organization_id,create_request_key) where create_request_key is not null do nothing returning * into saved;
    if not found then
      select * into saved from public.expenses where organization_id=actor.organization_id and create_request_key=p_key;
      if saved.create_request_payload is distinct from payload then raise exception 'Conflicting expense request.' using errcode='PT409'; end if;
      return jsonb_build_object('id',saved.id,'revision',saved.revision,'replayed',true);
    end if;
  else
    select * into saved from public.expenses where id=p_id and organization_id=actor.organization_id and branch_id=branch for update;
    if not found then raise exception 'Expense changed; refresh and try again.' using errcode='PT409'; end if;
    desired_status:=case p_operation when 'void' then 'archived' when 'restore' then 'active' else saved.status end;
    if (p_operation<>'save' and saved.status=desired_status) or
      (p_operation='save' and saved.category=btrim(p_category) and saved.amount=v_amount and saved.payment_method=p_method
        and saved.vendor_name is not distinct from nullif(btrim(p_vendor),'')
        and saved.notes is not distinct from nullif(btrim(p_notes),'') and saved.spent_at=coalesce(p_spent_at,saved.spent_at)) then
      return jsonb_build_object('id',saved.id,'revision',saved.revision,'replayed',true);
    end if;
    if p_revision is null or p_revision<>saved.revision then
      raise exception 'Expense changed; refresh before editing.' using errcode='PT409';
    end if;
    if p_operation='save' then
      update public.expenses set category=btrim(p_category),amount=v_amount,payment_method=p_method,
        vendor_name=nullif(btrim(p_vendor),''),notes=nullif(btrim(p_notes),''),spent_at=coalesce(p_spent_at,saved.spent_at),
        revision=revision+1 where id=saved.id returning * into saved;
    else
      update public.expenses set status=desired_status,
        archived_at=case when desired_status='archived' then clock_timestamp() end,
        archived_by=case when desired_status='archived' then actor.id end,
        revision=revision+1 where id=saved.id returning * into saved;
    end if;
  end if;
  insert into public.audit_logs(organization_id,branch_id,actor_id,module,action,details,metadata)
    values(actor.organization_id,branch,actor.id,'expenses',
      case when p_id is null then 'expenses.created' when p_operation='void' then 'expenses.voided'
        when p_operation='restore' then 'expenses.restored' else 'expenses.updated' end,
      'Expense saved',jsonb_build_object('expense_id',saved.id,'revision',saved.revision));
  return jsonb_build_object('id',saved.id,'revision',saved.revision,'replayed',false);
end; $$;
alter function cash_private.save_expense(uuid,uuid,bigint,text,text,public.payment_method,text,text,timestamptz,text) owner to expense_posting_executor;
create function public.save_cash_shift_expense(p_id uuid,p_request_key uuid,p_revision bigint,p_category text,
  p_amount text,p_method public.payment_method,p_vendor text,p_notes text,p_spent_at timestamptz,p_operation text default 'save') returns jsonb
language sql volatile security invoker set search_path='' as $$
  select cash_private.save_expense(p_id,p_request_key,p_revision,p_category,p_amount,p_method,p_vendor,p_notes,p_spent_at,p_operation);
$$;

create function cash_private.export_shifts() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;
begin
  select * into actor from public.profiles where id=cash_private.actor_id() and is_active and role='owner';
  if not found or actor.organization_id is null then raise exception 'Only owner can export accounting history.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.cash_shifts s where organization_id=actor.organization_id),'[]');
end; $$;
alter function cash_private.export_shifts() owner to cash_shift_executor;
create function public.export_cash_shift_history() returns jsonb
language sql stable security invoker set search_path='' as $$ select cash_private.export_shifts(); $$;

-- Existing financial mathematics retained; early admission and forward keys.
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

  perform cash_private.boundary(v_org_id,v_branch_id,false);
  if not exists(select 1 from public.profiles p left join public.staff_permissions sp
    on sp.profile_id=p.id and sp.organization_id=p.organization_id
    where p.id=v_user_id and p.is_active and p.organization_id=v_org_id and p.branch_id=v_branch_id
      and p.role=v_role and (p.role in ('owner','admin') or coalesce(sp.can_sell,p.role in ('manager','cashier')))
      and (not v_can_discount or p.role in ('owner','admin') or coalesce(sp.can_discount,p.role in ('manager','cashier')))
      and (not v_effective_loss_override or p.role in ('owner','admin') or coalesce(sp.can_sell_at_loss,false))) then
    raise exception 'Checkout authorization changed.' using errcode='42501';
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

drop function public.record_credit_payment(uuid,numeric,public.credit_payment_method,text,text);
drop function ledger_private.record_credit_payment(uuid,numeric,public.credit_payment_method,text,text);
create or replace function ledger_private.record_credit_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_method public.credit_payment_method,
  p_reference_number text,
  p_notes text,
  p_request_key uuid default null
)
returns jsonb
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
  v_request_payload jsonb;
  v_existing public.credit_payments;
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


  if p_request_key is null then raise exception 'Refresh and try again with a request key.' using errcode='22023'; end if;
  perform cash_private.maintenance_shared(v_org_id);
  if v_branch_id is not null then perform cash_private.boundary(v_org_id,v_branch_id,false); end if;
  if not exists(select 1 from public.profiles where id=v_user_id and is_active and organization_id=v_org_id
      and branch_id is not distinct from v_branch_id and role in ('owner','admin','manager','cashier')) then
    raise exception 'You do not have permission to log payments.' using errcode='42501'; end if;
  v_request_payload:=jsonb_build_object('customer',p_customer_id,'branch',v_branch_id,'amount',p_amount,'method',p_method,
    'reference',p_reference_number,'notes',p_notes);
  -- Lock customer row and check balance
  select outstanding_balance into v_curr_balance from public.customers where id = p_customer_id and organization_id=v_org_id for update;
  if not found then raise exception 'Customer not found' using errcode = 'P0001'; end if;
  select * into v_existing from public.credit_payments where organization_id=v_org_id and request_key=p_request_key;
  if found then
    if v_existing.request_payload is distinct from v_request_payload then
      raise exception 'Conflicting financial request.' using errcode='PT409';
    end if;
    return jsonb_build_object('id',v_existing.id,'replayed',true,'cash_shift_id',v_existing.cash_shift_id,'amount',v_existing.amount::text);
  end if;


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
    id, organization_id, branch_id, customer_id, amount, method, reference_number, notes, received_by, request_key, request_payload
  ) values (
    v_payment_id, v_org_id, v_branch_id, p_customer_id, p_amount, p_method, p_reference_number, p_notes, v_profile_id, p_request_key, v_request_payload
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
  return jsonb_build_object('id',v_payment_id,'replayed',false,'cash_shift_id',(select cash_shift_id from public.credit_payments where id=v_payment_id),'amount',p_amount::text);
end;
$$;

alter function ledger_private.record_credit_payment(uuid,numeric,public.credit_payment_method,text,text,uuid) owner to ledger_posting_executor;

revoke all on function ledger_private.record_credit_payment(uuid,numeric,public.credit_payment_method,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function ledger_private.record_credit_payment(uuid,numeric,public.credit_payment_method,text,text,uuid) to authenticated,service_role;

create function public.record_credit_payment(p_customer_id uuid,p_amount numeric,p_method public.credit_payment_method,p_reference_number text,p_notes text,p_request_key uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select ledger_private.record_credit_payment(p_customer_id,p_amount,p_method,p_reference_number,p_notes,p_request_key); $$;
revoke all on function public.record_credit_payment(uuid,numeric,public.credit_payment_method,text,text,uuid) from public,anon;
grant execute on function public.record_credit_payment(uuid,numeric,public.credit_payment_method,text,text,uuid) to authenticated,service_role;

drop function public.record_customer_write_off(uuid,numeric,text);
drop function ledger_private.record_customer_write_off(uuid,numeric,text);
create or replace function ledger_private.record_customer_write_off(
  p_customer_id uuid,
  p_amount numeric,
  p_reason text,
  p_request_key uuid default null
)
returns jsonb
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
  v_request_payload jsonb;
  v_existing public.customer_write_offs;
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


  if p_request_key is null then raise exception 'Refresh and try again with a request key.' using errcode='22023'; end if;
  perform cash_private.maintenance_shared(v_org_id);
  if v_branch_id is not null then perform cash_private.boundary(v_org_id,v_branch_id,false); end if;
  if not exists(select 1 from public.profiles where id=v_user_id and is_active and organization_id=v_org_id
      and branch_id is not distinct from v_branch_id and role in ('owner','admin')) then
    raise exception 'Only owner or admin can write off customer credit.' using errcode='42501'; end if;
  v_request_payload:=jsonb_build_object('customer',p_customer_id,'branch',v_branch_id,'amount',p_amount,'reason',p_reason);
  -- Lock customer row
  select outstanding_balance into v_curr_balance from public.customers where id = p_customer_id and organization_id=v_org_id for update;
  if not found then raise exception 'Customer not found' using errcode = 'P0001'; end if;
  select * into v_existing from public.customer_write_offs where organization_id=v_org_id and request_key=p_request_key;
  if found then
    if v_existing.request_payload is distinct from v_request_payload then
      raise exception 'Conflicting financial request.' using errcode='PT409';
    end if;
    return jsonb_build_object('id',v_existing.id,'replayed',true,'cash_shift_id',v_existing.cash_shift_id,'amount',v_existing.amount::text);
  end if;


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
    id, organization_id, branch_id, customer_id, amount, reason, written_by, request_key, request_payload
  ) values (
    v_write_off_id, v_org_id, v_branch_id, p_customer_id, p_amount, p_reason, v_profile_id, p_request_key, v_request_payload
  );

  -- Insert into customer_ledger_entries
  insert into public.customer_ledger_entries (
    organization_id, branch_id, customer_id, entry_type, direction,
    amount, balance_after, description, created_by
  ) values (
    v_org_id, v_branch_id, p_customer_id, 'write_off', 'credit',
    p_amount, v_balance_after, 'Credit write-off: ' || p_reason, v_profile_id
  );
  return jsonb_build_object('id',v_write_off_id,'replayed',false,'cash_shift_id',(select cash_shift_id from public.customer_write_offs where id=v_write_off_id),'amount',p_amount::text);
end;
$$;

alter function ledger_private.record_customer_write_off(uuid,numeric,text,uuid) owner to ledger_posting_executor;

revoke all on function ledger_private.record_customer_write_off(uuid,numeric,text,uuid) from public,anon,authenticated,service_role;
grant execute on function ledger_private.record_customer_write_off(uuid,numeric,text,uuid) to authenticated,service_role;

create function public.record_customer_write_off(p_customer_id uuid,p_amount numeric,p_reason text,p_request_key uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select ledger_private.record_customer_write_off(p_customer_id,p_amount,p_reason,p_request_key); $$;
revoke all on function public.record_customer_write_off(uuid,numeric,text,uuid) from public,anon;
grant execute on function public.record_customer_write_off(uuid,numeric,text,uuid) to authenticated,service_role;

drop function public.create_invoice_return(uuid,jsonb,numeric,text,text,text);
drop function ledger_private.create_invoice_return(uuid,jsonb,numeric,text,text,text);
create or replace function ledger_private.create_invoice_return(
  p_invoice_id uuid,
  p_items jsonb,
  p_refund_amount numeric,
  p_refund_method text,
  p_reference_number text,
  p_notes text,
  p_idempotency_key text default null
)
returns table(return_id uuid, return_no text, subtotal numeric, refund_amount numeric, idempotent_replay boolean)
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
  v_source_identity record;
  v_request_payload jsonb;
  v_existing_return public.returns;
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


  if nullif(btrim(p_idempotency_key),'') is null or length(p_idempotency_key)>200 then
    raise exception 'Refresh and try again with a request key.' using errcode='22023'; end if;
  select id,branch_id,customer_id into v_source_identity from public.invoices where id=p_invoice_id and organization_id=v_org_id;
  if not found then raise exception 'Invoice not found' using errcode='42501'; end if;
  perform cash_private.maintenance_shared(v_org_id);
  if v_source_identity.branch_id is not null then perform cash_private.boundary(v_org_id,v_source_identity.branch_id,false); end if;
  if not exists(select 1 from public.profiles where id=v_user_id and is_active and organization_id=v_org_id and role=v_role) then
    raise exception 'Return authorization changed.' using errcode='42501'; end if;
  perform 1 from public.organizations where id=v_org_id for update;
  if v_source_identity.customer_id is not null then
    perform 1 from public.customers where id=v_source_identity.customer_id and organization_id=v_org_id for update;
  end if;
  v_request_payload:=jsonb_build_object('invoice',p_invoice_id,'items',p_items,'refund',v_refund_amount,
    'method',p_refund_method,'reference',p_reference_number,'notes',p_notes);
  select * into v_existing_return from public.returns where organization_id=v_org_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing_return.request_payload is distinct from v_request_payload then raise exception 'Conflicting Return request.' using errcode='PT409'; end if;
    return query select v_existing_return.id,v_existing_return.return_no,v_existing_return.subtotal,v_existing_return.refund_amount,true;
    return;
  end if;
  select id, organization_id, branch_id, customer_id, invoice_no, status
    into v_invoice
    from public.invoices
    where id = p_invoice_id and organization_id = v_org_id
    for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0001'; end if;
  if v_invoice.status = 'void' then raise exception 'Cannot return a void invoice' using errcode = 'P0001'; end if;
  if v_invoice.branch_id is distinct from v_source_identity.branch_id or v_invoice.customer_id is distinct from v_source_identity.customer_id then
    raise exception 'Return source identity changed.' using errcode='PT409'; end if;

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
    subtotal, refund_amount, refund_method, reference_number, notes, created_by, idempotency_key, request_payload
  ) values (
    v_return_id, v_org_id, v_invoice.branch_id, p_invoice_id, v_invoice.customer_id, v_return_no,
    0, 0, nullif(p_refund_method, ''), nullif(p_reference_number, ''), nullif(p_notes, ''), v_profile_id, p_idempotency_key, v_request_payload
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

  return query select v_return_id, v_return_no, v_subtotal, v_refund_amount, false;
end;
$$;

alter function ledger_private.create_invoice_return(uuid,jsonb,numeric,text,text,text,text) owner to ledger_posting_executor;

revoke all on function ledger_private.create_invoice_return(uuid,jsonb,numeric,text,text,text,text) from public,anon;
grant execute on function ledger_private.create_invoice_return(uuid,jsonb,numeric,text,text,text,text) to authenticated,service_role;

create function public.create_invoice_return(p_invoice_id uuid,p_items jsonb,p_refund_amount numeric,
  p_refund_method text,p_reference_number text,p_notes text,p_idempotency_key text default null)
returns table(return_id uuid,return_no text,subtotal numeric,refund_amount numeric,idempotent_replay boolean)
language sql security invoker set search_path='' as $$
  select * from ledger_private.create_invoice_return(p_invoice_id,p_items,p_refund_amount,p_refund_method,p_reference_number,p_notes,p_idempotency_key);
$$;
revoke all on function public.create_invoice_return(uuid,jsonb,numeric,text,text,text,text) from public,anon;
grant execute on function public.create_invoice_return(uuid,jsonb,numeric,text,text,text,text) to authenticated,service_role;

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

  perform cash_private.maintenance_shared(v_org_id);
  perform 1 from public.organizations where id=v_org_id for update;
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

  perform cash_private.maintenance_shared(v_org_id);
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

  perform cash_private.maintenance_shared(v_org_id);
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

-- Restore authority stripping and reset coordination; business math unchanged.
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
    where key <> all(array['advance_cash_shift_id','advance_cash_shift_assignment_xid','advance_received_at','advance_received_by','repair_revision','repair_request_key','repair_request_payload','cash_shift_id','cash_shift_assignment_xid','accounting_version','open_request_key','open_request_payload','close_request_key','close_request_payload','close_audit_id','boundary_epoch','request_key','request_payload','idempotency_key','create_request_key','create_request_payload','revision','checkout_idempotency_key']) and key not in ('posting_sequence','posting_trust_version','posting_effective_at',
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
      if exists(select 1 from jsonb_object_keys(v_input) k where k <> all(array['id','organization_id','branch_id','opened_at','closed_at','opened_by','closed_by','starting_cash','expected_cash','counted_cash','cash_difference','notes','status','created_at','updated_at','close_snapshot'])) then
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
  return v_result - array['advance_cash_shift_id','advance_cash_shift_assignment_xid','advance_received_at','advance_received_by','repair_revision','repair_request_key','repair_request_payload','cash_shift_id','cash_shift_assignment_xid','accounting_version','open_request_key','open_request_payload','close_request_key','close_request_payload','close_audit_id','boundary_epoch','request_key','request_payload','idempotency_key','create_request_key','create_request_payload','revision','checkout_idempotency_key'] - 'posting_sequence' - 'posting_trust_version' - 'posting_effective_at'
    - 'source_trust_version' - 'source_effective_at' - 'source_transaction_id';
end; $function$;


CREATE OR REPLACE FUNCTION backup_private.finalize_job(p_job uuid, p_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '250ms'
AS $function$
declare
  v_started timestamptz:=clock_timestamp(); v_locked timestamptz;
  j backup_private.jobs:=backup_private.owned_job(p_job); v_epoch bigint;
  r backup_private.receipts; v_counts jsonb;
begin
  -- One lock order: organization mutex, job, then roots and dependent work.
  perform cash_private.maintenance_shared(j.organization_id);
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
end; $function$;


CREATE OR REPLACE FUNCTION backup_private.restore_ancillary(p_job uuid, p_table text, p_index integer, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '250ms'
AS $function$
declare j backup_private.jobs:=backup_private.owned_job(p_job); v_epoch bigint;
  v_rows jsonb; v_digest text; v_count integer; v_expected integer; v_done integer; v_error text;
begin
  perform cash_private.maintenance_shared(j.organization_id);
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
      insert into public.cash_shifts(id,organization_id,branch_id,opened_at,closed_at,opened_by,closed_by,starting_cash,expected_cash,counted_cash,cash_difference,notes,status,created_at,updated_at,close_snapshot)
      select r.id,r.organization_id,r.branch_id,r.opened_at,r.closed_at,r.opened_by,r.closed_by,r.starting_cash,r.expected_cash,r.counted_cash,r.cash_difference,r.notes,r.status,r.created_at,r.updated_at,r.close_snapshot from jsonb_array_elements(v_rows) e
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
end; $function$;


CREATE OR REPLACE FUNCTION ledger_private.factory_reset_core(p_organization_id uuid, p_actor_id uuid, p_reset_settings boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform cash_private.reset_lock(p_organization_id);
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

  -- All member sources are gone before the shift parent.
  delete from public.cash_shifts where organization_id = p_organization_id;
  get diagnostics v_cash_shifts_cnt = row_count;
  update cash_private.branch_boundaries set epoch=epoch+1 where organization_id=p_organization_id;

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
$function$;


-- Narrow helper authority; no public callback/admission execution.
revoke create on schema cash_private from backup_identity_executor,expense_posting_executor,repair_posting_executor;
revoke all on all functions in schema cash_private from public,anon,authenticated,service_role;
grant execute on function cash_private.maintenance_shared(uuid) to ledger_posting_executor,backup_import_executor,cash_shift_executor,expense_posting_executor,repair_posting_executor;
grant execute on function cash_private.boundary(uuid,uuid,boolean) to ledger_posting_executor,cash_shift_executor,expense_posting_executor,repair_posting_executor;
grant execute on function cash_private.admit(uuid,uuid) to ledger_posting_executor,expense_posting_executor,repair_posting_executor;
grant execute on function cash_private.money(text,boolean) to expense_posting_executor,repair_posting_executor;
grant execute on function cash_private.save_repair(uuid,uuid,bigint,jsonb) to authenticated;
revoke all on function public.save_cash_shift_repair(uuid,uuid,bigint,jsonb) from public,anon,service_role;
grant execute on function public.save_cash_shift_repair(uuid,uuid,bigint,jsonb) to authenticated;
grant execute on function cash_private.open_shift(uuid,text,text),cash_private.close_shift(uuid,uuid,text,text),cash_private.read_shift(uuid),cash_private.export_shifts() to authenticated;
grant execute on function cash_private.save_expense(uuid,uuid,bigint,text,text,public.payment_method,text,text,timestamptz,text) to authenticated;
grant select,update on cash_private.branch_boundaries to ledger_reset_executor;
create policy cash_boundary_reset on cash_private.branch_boundaries for all to ledger_reset_executor using(true) with check(true);
grant insert(close_snapshot) on public.cash_shifts to backup_import_executor;
revoke all on function public.open_cash_shift(uuid,text,text),public.close_cash_shift(uuid,uuid,text,text),public.get_cash_shift_snapshot(uuid),public.export_cash_shift_history(),public.save_cash_shift_expense(uuid,uuid,bigint,text,text,public.payment_method,text,text,timestamptz,text) from public,anon,service_role;
grant execute on function public.open_cash_shift(uuid,text,text),public.close_cash_shift(uuid,uuid,text,text),public.get_cash_shift_snapshot(uuid),public.export_cash_shift_history(),public.save_cash_shift_expense(uuid,uuid,bigint,text,text,public.payment_method,text,text,timestamptz,text) to authenticated;
-- Existing summary reads remain; new snapshot/receipt authority uses scoped RPCs.
revoke select on public.cash_shifts from public,anon,authenticated,service_role;
grant select(id,organization_id,branch_id,opened_at,closed_at,opened_by,closed_by,starting_cash,expected_cash,counted_cash,cash_difference,notes,status,created_at,updated_at,accounting_version) on public.cash_shifts to authenticated,service_role;
commit;

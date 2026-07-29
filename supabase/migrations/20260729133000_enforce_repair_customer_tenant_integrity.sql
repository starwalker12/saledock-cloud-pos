-- Enforce that a repair can only reference a customer from the same organization.
do $$
declare
  mismatch_count bigint;
begin
  select count(*)
    into mismatch_count
    from public.repairs as repair
    join public.customers as customer
      on customer.id = repair.customer_id
   where repair.customer_id is not null
     and customer.organization_id <> repair.organization_id;

  if mismatch_count > 0 then
    raise exception
      'Repair customer tenant-integrity preflight failed: % existing mismatch(es).',
      mismatch_count
      using errcode = '23514';
  end if;
end
$$;

create unique index if not exists customers_organization_id_id_key
  on public.customers (organization_id, id);

alter table public.repairs
  drop constraint repairs_customer_id_fkey;

alter table public.repairs
  add constraint repairs_organization_customer_id_fkey
  foreign key (organization_id, customer_id)
  references public.customers (organization_id, id)
  on update restrict
  on delete set null (customer_id);

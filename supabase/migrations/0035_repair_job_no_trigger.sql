-- Drop the NOT NULL constraint from job_no so the client doesn't need to send it
alter table public.repairs alter column job_no drop not null;

-- Create a function to generate the job_no sequence per organization safely using advisory locks
create or replace function public.set_repair_job_no()
returns trigger as $$
declare
  v_seq int;
begin
  if new.job_no is null or new.job_no = '' then
    -- Acquire a transaction-level advisory lock specific to this organization's repair sequences
    -- hashtext converts the UUID to an int4 to be used as a lock ID.
    perform pg_advisory_xact_lock(hashtext(new.organization_id::text));

    select coalesce(max(nullif(regexp_replace(job_no, '\D', '', 'g'), '')::int), 0) + 1
    into v_seq
    from public.repairs
    where organization_id = new.organization_id;

    new.job_no := 'RJ-' || lpad(v_seq::text, 6, '0');
  end if;
  return new;
end;
$$ language plpgsql;

-- Create a trigger that runs before insert to auto-populate job_no
drop trigger if exists ensure_repair_job_no on public.repairs;
create trigger ensure_repair_job_no
before insert on public.repairs
for each row
execute function public.set_repair_job_no();

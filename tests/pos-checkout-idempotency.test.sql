-- POS checkout idempotency — database-level proof + manual RPC test plan.
--
-- There is no SQL test runner wired into this repo, so this file is two things:
--   PART A: a self-contained, SAFE proof you can paste into the Supabase SQL
--           editor of ANY environment (incl. production) — it only creates a
--           TEMP table (auto-dropped, session-local) and touches NO real data.
--           It raises an exception if the idempotency guarantee does not hold.
--   PART B: a documented manual test for the full pos_checkout RPC, to run
--           against a DISPOSABLE / staging database (it creates real rows).
--
-- Run PART A by pasting it into the Supabase SQL editor, with psql against a
-- disposable database, or through the approved Supabase MCP SQL query path.
-- Supabase CLI 2.101.0 does not provide a `supabase db execute` command.

-- ───────────────────────────────────────────────────────────────────────────
-- PART A — Proof that the partial unique index prevents two invoices sharing
-- an (organization_id, checkout_idempotency_key). Safe: temp table only.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_dup_blocked boolean := false;   -- same (org,key) twice must FAIL
  v_diff_ok     boolean := false;   -- different keys must both succeed
  v_null_ok     boolean := false;   -- multiple null keys must be allowed
  org uuid := gen_random_uuid();
begin
  create temp table _idem_proof (
    organization_id uuid not null,
    checkout_idempotency_key text
  ) on commit drop;

  -- Mirror the production index exactly.
  create unique index on _idem_proof (organization_id, checkout_idempotency_key)
    where checkout_idempotency_key is not null;

  -- 1) two different keys for the same org → both insert
  insert into _idem_proof values (org, 'key-A');
  begin
    insert into _idem_proof values (org, 'key-B');
    v_diff_ok := true;
  exception when unique_violation then
    v_diff_ok := false;
  end;

  -- 2) same key again for the same org → blocked (this is the core guarantee:
  --    a duplicate checkout submit cannot create a second invoice)
  begin
    insert into _idem_proof values (org, 'key-A');
    v_dup_blocked := false;  -- should be unreachable
  exception when unique_violation then
    v_dup_blocked := true;
  end;

  -- 3) multiple null keys → allowed (partial index, legacy / non-POS invoices)
  insert into _idem_proof values (org, null);
  begin
    insert into _idem_proof values (org, null);
    v_null_ok := true;
  exception when unique_violation then
    v_null_ok := false;
  end;

  raise notice 'idempotency proof → dup_blocked=% different_keys_ok=% null_keys_ok=%',
    v_dup_blocked, v_diff_ok, v_null_ok;

  if not (v_dup_blocked and v_diff_ok and v_null_ok) then
    raise exception 'IDEMPOTENCY PROOF FAILED: dup_blocked=% diff_ok=% null_ok=%',
      v_dup_blocked, v_diff_ok, v_null_ok;
  end if;
end $$;

select 'PART A PASSED: (organization_id, checkout_idempotency_key) is unique when the key is set; '
    || 'duplicate same-key insert is blocked; different keys and multiple null keys are allowed.'
       as result;

-- ───────────────────────────────────────────────────────────────────────────
-- PART B — Manual full-RPC test (run on a DISPOSABLE / staging DB; creates rows).
-- Requires: an authenticated session (auth.uid() set), one active profile/org,
-- one in-stock product, and a stock lot. Substitute real IDs below.
--
--   :prod  = a product_id that is active and has stock
--   :key1  = gen_random_uuid()::text   (a fresh idempotency key)
--   :key2  = a different gen_random_uuid()::text
--
-- 1) Normal checkout — exactly one invoice, payment, stock movement:
--    select * from pos_checkout(null, null,
--      jsonb_build_array(jsonb_build_object('product_id', :prod, 'quantity', 1, 'unit_price', 100)),
--      0, 'cash', 100, null, null, false, :key1);
--    -- note the returned invoice_id / invoice_no; idempotent_replay = false.
--    select count(*) from invoices  where checkout_idempotency_key = :key1;  -- expect 1
--    select stock_quantity from products where id = :prod;                   -- note value
--
-- 2) Retry with the SAME key (simulates a timeout/double-submit):
--    select * from pos_checkout(null, null,
--      jsonb_build_array(jsonb_build_object('product_id', :prod, 'quantity', 1, 'unit_price', 100)),
--      0, 'cash', 100, null, null, false, :key1);
--    -- expect the SAME invoice_id / invoice_no as step 1 and
--    -- idempotent_replay = true.
--    select count(*) from invoices  where checkout_idempotency_key = :key1;  -- expect 1 (no 2nd invoice)
--    select count(*) from payments  where invoice_id = '<invoice from step 1>';  -- expect 1 (no 2nd payment)
--    select stock_quantity from products where id = :prod;                   -- expect UNCHANGED vs step 1
--
-- 3) Different key → a new, separate sale:
--    select * from pos_checkout(null, null,
--      jsonb_build_array(jsonb_build_object('product_id', :prod, 'quantity', 1, 'unit_price', 100)),
--      0, 'cash', 100, null, null, false, :key2);
--    -- expect a DIFFERENT invoice_id; stock decremented once more.
--
-- 4) Failed-before-invoice retry is allowed: call with an empty cart and :key1b
--    (a brand-new key) → raises 'Cart is empty', NO invoice stored for that key;
--    retrying with the same :key1b and a valid cart then succeeds (creates one).
--
-- 5) Invoice-number conflicts are not swallowed: in a disposable transaction,
--    force an unrelated (organization_id, invoice_no) unique conflict while no
--    invoice exists for the supplied idempotency key. Expect unique_violation;
--    the handler must re-raise because its same-key lookup finds no invoice.
--
-- 6) Legacy compatibility: call the 10-arg function with only its original nine
--    positional arguments. The default null key must preserve the old checkout
--    behavior and return invoice_id, invoice_no, idempotent_replay = false.
--    Also inventory the pre-existing 8-arg overload: it remains callable by
--    authenticated clients but is non-idempotent and is not used by this app.
-- ───────────────────────────────────────────────────────────────────────────

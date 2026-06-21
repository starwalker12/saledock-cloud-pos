-- Migration: drop the legacy 8-argument pos_checkout overload
--
-- The active checkout RPC is the 10-argument function (added in
-- 20260620160000_pos_checkout_idempotency):
--   pos_checkout(uuid, uuid, jsonb, numeric, payment_method, numeric, text, text,
--                boolean, text) RETURNS (invoice_id, invoice_no, idempotent_replay)
--
-- A legacy 8-argument overload still existed:
--   pos_checkout(uuid, uuid, jsonb, numeric, payment_method, numeric, text, text)
--     RETURNS (invoice_id, invoice_no)
-- It is the pre-0030 version (no per-checkout loss override, no idempotency key)
-- and has been orphaned since migration 0030 added p_allow_loss_override. It is
-- non-idempotent and is NOT called by the app: src/app/pos/actions.ts passes all
-- 10 named arguments (incl. p_allow_loss_override and p_idempotency_key), which
-- PostgREST can only resolve to the 10-arg function. No test, script, doc, or
-- API helper calls the 8-arg signature.
--
-- Dropping it removes a non-idempotent duplicate-sale path and an ambiguous
-- overload. Behavior of the active function is unchanged:
--   * 10 named args  -> 10-arg function (the app path), unchanged.
--   * 9 named args   -> 10-arg function via p_idempotency_key default, unchanged.
--   * 8 named args   -> 10-arg function via two defaults (previously the exact
--                       8-arg). The app never makes 8-arg calls.
--
-- Text/DDL: this DROPs only the legacy overload. The active 10-arg function, all
-- checkout/invoice/payment/stock/FIFO/ledger/loss logic, grants, and the
-- invoices table/index are untouched.

drop function if exists public.pos_checkout(
  uuid, uuid, jsonb, numeric, public.payment_method, numeric, text, text
);

-- RPC EXECUTE hardening.
--
-- Background: every app RPC in this database is created with the default
-- PostgreSQL behavior, which grants EXECUTE to PUBLIC (and Supabase's
-- internal grant logic adds anon as well). All five app RPCs below are
-- security invoker and check auth.uid() / profile state internally, so
-- there is no live exposure today — an unauthenticated caller just gets
-- a "Not authenticated" exception. But unnecessary grants are still
-- a security smell, and this migration revokes them.
--
-- After this migration each RPC is callable only by:
--   - authenticated  (Supabase signed-in users — the normal app)
--   - service_role   (server actions via the admin client)
--
-- PUBLIC and anon execute are revoked.
--
-- Helper functions used by RLS (current_organization_id, current_user_role)
-- and the trigger function set_updated_at are intentionally NOT changed —
-- they're already either tightly granted (migration 0010) or harmless.

-- pos_checkout
revoke execute on function public.pos_checkout(
  uuid, uuid, jsonb, numeric, public.payment_method, numeric, text, text
) from public;
revoke execute on function public.pos_checkout(
  uuid, uuid, jsonb, numeric, public.payment_method, numeric, text, text
) from anon;
grant execute on function public.pos_checkout(
  uuid, uuid, jsonb, numeric, public.payment_method, numeric, text, text
) to authenticated;
grant execute on function public.pos_checkout(
  uuid, uuid, jsonb, numeric, public.payment_method, numeric, text, text
) to service_role;

-- record_credit_payment
revoke execute on function public.record_credit_payment(
  uuid, numeric, public.credit_payment_method, text, text
) from public;
revoke execute on function public.record_credit_payment(
  uuid, numeric, public.credit_payment_method, text, text
) from anon;
grant execute on function public.record_credit_payment(
  uuid, numeric, public.credit_payment_method, text, text
) to authenticated;
grant execute on function public.record_credit_payment(
  uuid, numeric, public.credit_payment_method, text, text
) to service_role;

-- add_stock_lot
revoke execute on function public.add_stock_lot(
  uuid, text, date, integer, numeric, uuid, text
) from public;
revoke execute on function public.add_stock_lot(
  uuid, text, date, integer, numeric, uuid, text
) from anon;
grant execute on function public.add_stock_lot(
  uuid, text, date, integer, numeric, uuid, text
) to authenticated;
grant execute on function public.add_stock_lot(
  uuid, text, date, integer, numeric, uuid, text
) to service_role;

-- adjust_stock
revoke execute on function public.adjust_stock(
  uuid, text, integer, text
) from public;
revoke execute on function public.adjust_stock(
  uuid, text, integer, text
) from anon;
grant execute on function public.adjust_stock(
  uuid, text, integer, text
) to authenticated;
grant execute on function public.adjust_stock(
  uuid, text, integer, text
) to service_role;

-- create_invoice_return
revoke execute on function public.create_invoice_return(
  uuid, jsonb, numeric, text, text, text
) from public;
revoke execute on function public.create_invoice_return(
  uuid, jsonb, numeric, text, text, text
) from anon;
grant execute on function public.create_invoice_return(
  uuid, jsonb, numeric, text, text, text
) to authenticated;
grant execute on function public.create_invoice_return(
  uuid, jsonb, numeric, text, text, text
) to service_role;

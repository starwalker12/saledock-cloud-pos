-- Deterministic SQL test for service sale with unit_price: 0.
-- This must be run after pos_checkout has been updated.
DO $$
DECLARE
  v_org_id uuid := '00000000-0000-4000-8000-000000000001';
  v_branch_id uuid := '00000000-0000-4000-8000-000000000101';
  v_user_id uuid;
  v_service_id uuid := '00000000-0000-4000-8000-000000003003';
  v_cart jsonb;
  v_invoice_id uuid;
  v_invoice_no text;
  v_idem_key text := '00000000-0000-4000-8000-00000000dead';
  v_line_total numeric;
  v_grand_total numeric;
  v_invoice_amount_paid numeric;
  v_payment_row_count int;
  v_payment_amount numeric;
  v_item_count int;
BEGIN
  -- Use the seeded owner profile.
  SELECT id INTO v_user_id FROM public.profiles
   WHERE organization_id = v_org_id AND role = 'owner' LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Test setup failed: owner profile not found';
  END IF;

  -- Simulate the exact buggy cart payload.
  v_cart := jsonb_build_array(jsonb_build_object(
    'product_id', v_service_id,
    'quantity', 1,
    'unit_price', 0,
    'discount', 0,
    'service_provider', 'EasyPaisa',
    'service_direction', 'cash_in',
    'service_account_number', '03001234567',
    'service_reference_no', 'REF-123',
    'service_transaction_amount', 1000,
    'service_commission', 50,
    'service_total_charged', 1050
  ));

  -- Run checkout as the owner.
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT invoice_id, invoice_no
    INTO v_invoice_id, v_invoice_no
    FROM public.pos_checkout(
      p_branch_id := v_branch_id,
      p_customer_id := NULL,
      p_cart := v_cart,
      p_discount_total := 0,
      p_payment_method := 'cash'::public.payment_method,
      p_amount_paid := 1050,
      p_payment_ref := NULL,
      p_note := 'Service unit_price=0 regression test',
      p_allow_loss_override := false,
      p_idempotency_key := v_idem_key
    );

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Checkout did not return an invoice';
  END IF;

  SELECT line_total INTO v_line_total
    FROM public.invoice_items
   WHERE invoice_id = v_invoice_id AND product_id = v_service_id;

  SELECT grand_total, amount_paid INTO v_grand_total, v_invoice_amount_paid
    FROM public.invoices
   WHERE id = v_invoice_id;

  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_payment_row_count, v_payment_amount
    FROM public.payments
   WHERE invoice_id = v_invoice_id;

  SELECT COUNT(*) INTO v_item_count
    FROM public.invoice_item_stock_allocations
   WHERE invoice_id = v_invoice_id;

  -- Cleanup test rows.
  DELETE FROM public.payments WHERE invoice_id = v_invoice_id;
  DELETE FROM public.invoice_items WHERE invoice_id = v_invoice_id;
  DELETE FROM public.invoices WHERE id = v_invoice_id;

  -- Assertions.
  IF v_line_total IS DISTINCT FROM 1050 THEN
    RAISE EXCEPTION 'Expected invoice item line_total 1050, got %', v_line_total;
  END IF;

  IF v_grand_total IS DISTINCT FROM 1050 THEN
    RAISE EXCEPTION 'Expected invoice grand_total 1050, got %', v_grand_total;
  END IF;

  IF v_invoice_amount_paid IS DISTINCT FROM 1050 THEN
    RAISE EXCEPTION 'Expected invoice amount_paid 1050, got %', v_invoice_amount_paid;
  END IF;

  IF v_payment_row_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Expected exactly one payment row, got %', v_payment_row_count;
  END IF;

  IF v_payment_amount IS DISTINCT FROM 1050 THEN
    RAISE EXCEPTION 'Expected payments.amount 1050, got %', v_payment_amount;
  END IF;

  IF v_item_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Expected zero stock allocations for service, got %', v_item_count;
  END IF;

  RAISE NOTICE 'PASS: service unit_price=0 cart produces invoice total 1050 (invoice: %)', v_invoice_no;
END $$;

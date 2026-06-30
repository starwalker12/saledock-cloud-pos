-- Deterministic SQL tests for SaleDock MVP Part 2 QA checklist items
-- that can be verified without a browser: customer settlement, cash drawer
-- credit collection, write-offs, cross-org schema, product image storage,
-- and backup/import schema.
--
-- Run with: npx supabase db query --file tests/pos-qa-checklist-part2.sql
DO $$
DECLARE
  v_org_id uuid := '00000000-0000-4000-8000-000000000001';
  v_branch_id uuid := '00000000-0000-4000-8000-000000000101';
  v_user_id uuid;
  v_customer_id uuid := '00000000-0000-4000-8000-000000004001';
  v_product_id uuid := '00000000-0000-4000-8000-000000003001';
  v_cart jsonb;
  v_invoice_id uuid;
  v_invoice_no text;
  v_idem_key text;
  v_initial_balance numeric;
  v_balance_after numeric;
  v_inv_amount_paid numeric;
  v_inv_balance_due numeric;
  v_inv_status public.invoice_status;
  v_ledger_count int;
  v_payment_count int;
  v_payment_method public.credit_payment_method;
  v_write_off_count int;
  v_policy_count int;
  v_bucket_count int;
  v_migration_count int;
  v_expected_cash numeric;
  v_cash_sales numeric;
  v_credit_collection_cash numeric;
  v_cash_expenses numeric;
  v_cash_refunds numeric;
BEGIN
  -- Use the seeded owner profile.
  SELECT id INTO v_user_id FROM public.profiles
   WHERE organization_id = v_org_id AND role = 'owner' LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Test setup failed: owner profile not found';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  ---------------------------------------------------------------------------
  -- 1. Customer credit sale increases outstanding balance
  ---------------------------------------------------------------------------
  SELECT outstanding_balance INTO v_initial_balance
    FROM public.customers WHERE id = v_customer_id;

  v_idem_key := 'qa-checklist-credit-sale-' || extract(epoch from now())::text;
  v_cart := jsonb_build_array(jsonb_build_object(
    'product_id', v_product_id,
    'quantity', 1,
    'unit_price', 1200,
    'discount', 0
  ));

  SELECT invoice_id, invoice_no
    INTO v_invoice_id, v_invoice_no
    FROM public.pos_checkout(
      p_branch_id := v_branch_id,
      p_customer_id := v_customer_id,
      p_cart := v_cart,
      p_discount_total := 0,
      p_payment_method := 'customer_credit'::public.payment_method,
      p_amount_paid := 0,
      p_payment_ref := NULL,
      p_note := 'QA checklist credit sale',
      p_allow_loss_override := false,
      p_idempotency_key := v_idem_key
    );

  SELECT outstanding_balance INTO v_balance_after
    FROM public.customers WHERE id = v_customer_id;

  IF v_balance_after IS DISTINCT FROM (v_initial_balance + 1200) THEN
    RAISE EXCEPTION 'Credit sale did not increase outstanding balance: expected %, got %',
      v_initial_balance + 1200, v_balance_after;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Cash settlement (FIFO) reduces outstanding and updates invoice
  ---------------------------------------------------------------------------
  PERFORM public.record_credit_payment(
    p_customer_id := v_customer_id,
    p_amount := 700,
    p_method := 'cash'::public.credit_payment_method,
    p_reference_number := 'QA-CASH-1',
    p_notes := 'QA cash settlement partial'
  );

  SELECT amount_paid, balance_due, status
    INTO v_inv_amount_paid, v_inv_balance_due, v_inv_status
    FROM public.invoices WHERE id = v_invoice_id;

  IF v_inv_amount_paid IS DISTINCT FROM 700 THEN
    RAISE EXCEPTION 'Invoice amount_paid after partial settlement: expected 700, got %', v_inv_amount_paid;
  END IF;

  IF v_inv_balance_due IS DISTINCT FROM 500 THEN
    RAISE EXCEPTION 'Invoice balance_due after partial settlement: expected 500, got %', v_inv_balance_due;
  END IF;

  IF v_inv_status IS DISTINCT FROM 'partial'::public.invoice_status THEN
    RAISE EXCEPTION 'Invoice status after partial settlement: expected partial, got %', v_inv_status;
  END IF;

  SELECT outstanding_balance INTO v_balance_after
    FROM public.customers WHERE id = v_customer_id;

  IF v_balance_after IS DISTINCT FROM (v_initial_balance + 500) THEN
    RAISE EXCEPTION 'Customer balance after partial settlement: expected %, got %',
      v_initial_balance + 500, v_balance_after;
  END IF;

  -- Settle remaining 500
  PERFORM public.record_credit_payment(
    p_customer_id := v_customer_id,
    p_amount := 500,
    p_method := 'cash'::public.credit_payment_method,
    p_reference_number := 'QA-CASH-2',
    p_notes := 'QA cash settlement final'
  );

  SELECT amount_paid, balance_due, status
    INTO v_inv_amount_paid, v_inv_balance_due, v_inv_status
    FROM public.invoices WHERE id = v_invoice_id;

  IF v_inv_amount_paid IS DISTINCT FROM 1200 THEN
    RAISE EXCEPTION 'Invoice amount_paid after final settlement: expected 1200, got %', v_inv_amount_paid;
  END IF;

  IF v_inv_balance_due IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Invoice balance_due after final settlement: expected 0, got %', v_inv_balance_due;
  END IF;

  IF v_inv_status IS DISTINCT FROM 'paid'::public.invoice_status THEN
    RAISE EXCEPTION 'Invoice status after final settlement: expected paid, got %', v_inv_status;
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Digital settlement creates credit_payments row with method=card
  ---------------------------------------------------------------------------
  v_idem_key := 'qa-checklist-digital-sale-' || extract(epoch from now())::text;

  SELECT invoice_id, invoice_no
    INTO v_invoice_id, v_invoice_no
    FROM public.pos_checkout(
      p_branch_id := v_branch_id,
      p_customer_id := v_customer_id,
      p_cart := v_cart,
      p_discount_total := 0,
      p_payment_method := 'customer_credit'::public.payment_method,
      p_amount_paid := 0,
      p_payment_ref := NULL,
      p_note := 'QA checklist digital settlement sale',
      p_allow_loss_override := false,
      p_idempotency_key := v_idem_key
    );

  PERFORM public.record_credit_payment(
    p_customer_id := v_customer_id,
    p_amount := 1200,
    p_method := 'card'::public.credit_payment_method,
    p_reference_number := 'QA-CARD-1',
    p_notes := 'QA digital settlement'
  );

  SELECT method INTO v_payment_method
    FROM public.credit_payments
   WHERE customer_id = v_customer_id
     AND reference_number = 'QA-CARD-1';

  IF v_payment_method IS DISTINCT FROM 'card'::public.credit_payment_method THEN
    RAISE EXCEPTION 'Digital settlement method: expected card, got %', v_payment_method;
  END IF;

  ---------------------------------------------------------------------------
  -- 4. Write-off reduces outstanding and creates ledger + write-off row
  ---------------------------------------------------------------------------
  v_idem_key := 'qa-checklist-writeoff-sale-' || extract(epoch from now())::text;

  SELECT invoice_id, invoice_no
    INTO v_invoice_id, v_invoice_no
    FROM public.pos_checkout(
      p_branch_id := v_branch_id,
      p_customer_id := v_customer_id,
      p_cart := v_cart,
      p_discount_total := 0,
      p_payment_method := 'customer_credit'::public.payment_method,
      p_amount_paid := 0,
      p_payment_ref := NULL,
      p_note := 'QA checklist write-off sale',
      p_allow_loss_override := false,
      p_idempotency_key := v_idem_key
    );

  SELECT outstanding_balance INTO v_balance_after
    FROM public.customers WHERE id = v_customer_id;

  PERFORM public.record_customer_write_off(
    p_customer_id := v_customer_id,
    p_amount := 200,
    p_reason := 'QA uncollectible'
  );

  SELECT count(*) INTO v_write_off_count
    FROM public.customer_write_offs
   WHERE customer_id = v_customer_id AND reason = 'QA uncollectible' AND amount = 200;

  IF v_write_off_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Write-off row count: expected 1, got %', v_write_off_count;
  END IF;

  SELECT count(*) INTO v_ledger_count
    FROM public.customer_ledger_entries
   WHERE customer_id = v_customer_id AND entry_type = 'write_off' AND amount = 200;

  IF v_ledger_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Write-off ledger entry count: expected 1, got %', v_ledger_count;
  END IF;

  SELECT outstanding_balance INTO v_balance_after
    FROM public.customers WHERE id = v_customer_id;

  IF v_balance_after IS DISTINCT FROM (v_initial_balance + 1000) THEN
    RAISE EXCEPTION 'Customer balance after write-off: expected %, got %',
      v_initial_balance + 1000, v_balance_after;
  END IF;

  ---------------------------------------------------------------------------
  -- 5. Daily closing expected cash formula includes credit_collection_cash
  --    (mirrors src/lib/data/daily-closing.ts getDayActivity logic)
  ---------------------------------------------------------------------------
  SELECT COALESCE(SUM(amount), 0) INTO v_cash_sales
    FROM public.payments
   WHERE organization_id = v_org_id
     AND branch_id = v_branch_id
     AND method = 'cash';

  SELECT COALESCE(SUM(amount), 0) INTO v_credit_collection_cash
    FROM public.credit_payments
   WHERE organization_id = v_org_id
     AND branch_id = v_branch_id
     AND method = 'cash';

  SELECT COALESCE(SUM(amount), 0) INTO v_cash_expenses
    FROM public.expenses
   WHERE organization_id = v_org_id
     AND branch_id = v_branch_id
     AND status = 'active'
     AND payment_method = 'cash';

  SELECT COALESCE(SUM(refund_amount), 0) INTO v_cash_refunds
    FROM public.returns
   WHERE organization_id = v_org_id
     AND branch_id = v_branch_id
     AND status = 'completed'
     AND refund_method = 'cash';

  v_expected_cash := v_cash_sales - v_cash_refunds - v_cash_expenses + v_credit_collection_cash;

  -- We expect credit_collection_cash > 0 because of the cash settlements above.
  IF v_credit_collection_cash <= 0 THEN
    RAISE EXCEPTION 'credit_collection_cash should be positive after cash settlements, got %', v_credit_collection_cash;
  END IF;

  IF v_expected_cash < v_credit_collection_cash THEN
    RAISE EXCEPTION 'expected_cash formula appears broken: got %', v_expected_cash;
  END IF;

  ---------------------------------------------------------------------------
  -- 6. Cross-org isolation: org-scoped RLS policies exist on critical tables
  ---------------------------------------------------------------------------
  SELECT count(*) INTO v_policy_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('invoices', 'customers', 'payments', 'credit_payments',
                       'customer_write_offs', 'products', 'daily_closings',
                       'import_jobs', 'import_row_mappings', 'cash_shifts')
     AND cmd IN ('SELECT', 'ALL')
     AND qual LIKE '%current_organization_id()%'
     AND permissive = 'PERMISSIVE';

  IF v_policy_count < 5 THEN
    RAISE EXCEPTION 'Expected at least 5 org-scoped RLS SELECT/ALL policies, found %', v_policy_count;
  END IF;

  ---------------------------------------------------------------------------
  -- 7. Product image storage bucket and write policies exist
  ---------------------------------------------------------------------------
  SELECT count(*) INTO v_bucket_count
    FROM storage.buckets
   WHERE id = 'product-images';

  IF v_bucket_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'product-images storage bucket missing';
  END IF;

  SELECT count(*) INTO v_policy_count
    FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND policyname LIKE '%Product images%';

  IF v_policy_count < 3 THEN
    RAISE EXCEPTION 'Expected at least 3 product-images storage policies, found %', v_policy_count;
  END IF;

  ---------------------------------------------------------------------------
  -- 8. Backup/import schema readiness
  ---------------------------------------------------------------------------
  SELECT count(*) INTO v_migration_count
    FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename IN ('import_jobs', 'import_row_mappings');

  IF v_migration_count IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Import backup tables missing: expected 2, found %', v_migration_count;
  END IF;

  SELECT count(*) INTO v_policy_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('import_jobs', 'import_row_mappings')
     AND cmd = 'ALL'
     AND qual LIKE '%current_organization_id()%'
     AND permissive = 'PERMISSIVE';

  IF v_policy_count IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Expected 2 org-scoped RLS ALL policies on import tables, found %', v_policy_count;
  END IF;

  ---------------------------------------------------------------------------
  -- Cleanup: remove test invoices, payments, ledger, write-offs, credit payments
  ---------------------------------------------------------------------------
  DELETE FROM public.customer_ledger_entries
   WHERE customer_id = v_customer_id
     AND created_by = v_user_id
     AND description LIKE 'QA%' OR description LIKE 'Credit write-off: QA%' OR reference_number LIKE 'QA%';

  DELETE FROM public.customer_write_offs
   WHERE customer_id = v_customer_id AND reason = 'QA uncollectible';

  DELETE FROM public.credit_payments
   WHERE customer_id = v_customer_id AND reference_number LIKE 'QA%';

  DELETE FROM public.payments WHERE invoice_id IN (
    SELECT id FROM public.invoices WHERE note LIKE 'QA checklist%'
  );

  DELETE FROM public.invoice_items WHERE invoice_id IN (
    SELECT id FROM public.invoices WHERE note LIKE 'QA checklist%'
  );

  DELETE FROM public.invoices WHERE note LIKE 'QA checklist%';

  -- Restore customer outstanding balance to its original value
  UPDATE public.customers
     SET outstanding_balance = v_initial_balance
   WHERE id = v_customer_id;

  RAISE NOTICE 'PASS: Part 2 QA checklist SQL tests completed';
END $$;

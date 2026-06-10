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

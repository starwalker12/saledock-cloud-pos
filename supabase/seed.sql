insert into public.organizations (id, name, legal_name, phone, email, address)
values (
  '00000000-0000-4000-8000-000000000001',
  'Gadget Zone',
  'Gadget Zone',
  '+923104666026',
  'demo@gadgetzone.example',
  'Demo Main Market Branch'
)
on conflict (id) do nothing;

insert into public.branches (id, organization_id, name, phone, address)
values (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000001',
  'Main Branch',
  '+923104666026',
  'Demo Main Market Branch'
)
on conflict (id) do nothing;

insert into public.product_categories (id, organization_id, name)
values
  ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000001', 'Accessories'),
  ('00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000001', 'Smartphones'),
  ('00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000000001', 'Digital Services'),
  ('00000000-0000-4000-8000-000000001004', '00000000-0000-4000-8000-000000000001', 'Repairs')
on conflict (organization_id, name) do nothing;

insert into public.suppliers (id, organization_id, name, company, phone)
values (
  '00000000-0000-4000-8000-000000002001',
  '00000000-0000-4000-8000-000000000001',
  'Demo Wholesale Supplier',
  'Demo Mobile Accessories',
  '+923000000000'
)
on conflict (id) do nothing;

insert into public.products (
  id,
  organization_id,
  branch_id,
  category_id,
  supplier_id,
  name,
  type,
  purchase_price,
  sale_price,
  stock_quantity,
  minimum_stock,
  service_type,
  service_pricing_mode,
  default_commission_amount
)
values
  ('00000000-0000-4000-8000-000000003001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000002001', 'iPhone 15 Pro Max Clear Case', 'product', 650, 1200, 20, 5, null, null, 0),
  ('00000000-0000-4000-8000-000000003002', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000002001', '20W USB-C Power Adapter', 'product', 2200, 3500, 12, 4, null, null, 0),
  ('00000000-0000-4000-8000-000000003003', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001003', null, 'EasyPaisa Cash In Service', 'service', 0, 0, 0, 0, 'Wallet Transfer', 'amount_plus_commission', 50)
on conflict (id) do nothing;

insert into public.customers (id, organization_id, branch_id, name, phone, notes)
values (
  '00000000-0000-4000-8000-000000004001',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  'Demo Walk-in Customer',
  '+923001111111',
  'Safe demo customer. Replace with real customers only in production.'
)
on conflict (id) do nothing;

insert into public.app_settings (
  organization_id,
  branch_id,
  shop_name,
  business_subtitle,
  phone,
  email,
  address,
  receipt_footer,
  settings
)
values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  'Gadget Zone',
  'Mobile & Accessories Hub',
  '+923104666026',
  'demo@gadgetzone.example',
  'Demo Main Market Branch',
  'Thank you for shopping at Gadget Zone.',
  '{"repair_statuses":["received","waiting_for_parts","in_progress","completed","delivered","cancelled"]}'::jsonb
);

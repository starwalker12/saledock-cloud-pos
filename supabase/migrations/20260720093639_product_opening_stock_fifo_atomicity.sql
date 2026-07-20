-- Create a catalog product and its optional opening FIFO artifacts in one
-- transaction. This function intentionally does not repair legacy mismatches
-- or affect the separate restock, adjustment, supplier-purchase, or import paths.
create function public.create_product_with_opening_stock(
  p_product_id uuid,
  p_name text,
  p_sku text,
  p_barcode text,
  p_category_id uuid,
  p_supplier_id uuid,
  p_product_type text,
  p_purchase_price numeric,
  p_sale_price numeric,
  p_opening_stock integer,
  p_minimum_stock integer,
  p_allow_sell_at_loss boolean,
  p_sell_at_loss_reason text,
  p_image_path text,
  p_notes text,
  p_is_active boolean
)
returns table(
  product_id uuid,
  opening_lot_id uuid,
  opening_movement_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_product_type public.product_type;
  v_product_id uuid := coalesce(p_product_id, gen_random_uuid());
  v_lot_id uuid;
  v_movement_id uuid;
  v_barcode text := nullif(btrim(p_barcode), '');
  v_name text := btrim(p_name);
  v_sku text := nullif(btrim(p_sku), '');
  v_reason text := coalesce(btrim(p_sell_at_loss_reason), '');
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
    raise exception 'You do not have permission to manage catalog.' using errcode = '42501';
  end if;

  if v_profile.branch_id is null or not exists (
    select 1
    from public.branches
    where id = v_profile.branch_id
      and organization_id = v_profile.organization_id
      and is_active = true
  ) then
    raise exception 'No active branch is assigned to this user.' using errcode = 'P0001';
  end if;

  if p_product_type not in ('product', 'service') then
    raise exception 'Invalid product type.' using errcode = '22023';
  end if;
  v_product_type := p_product_type::public.product_type;

  if v_name is null or v_name = '' or char_length(v_name) > 200 then
    raise exception 'Product name is required.' using errcode = '22023';
  end if;
  if p_purchase_price is null or p_purchase_price < 0
     or p_sale_price is null or p_sale_price < 0 then
    raise exception 'Prices must be 0 or more.' using errcode = '22023';
  end if;
  if p_opening_stock is null or p_opening_stock < 0
     or p_minimum_stock is null or p_minimum_stock < 0 then
    raise exception 'Stock values must be whole numbers of 0 or more.' using errcode = '22023';
  end if;
  if v_product_type = 'service' and p_opening_stock <> 0 then
    raise exception 'Services cannot have opening stock.' using errcode = '22023';
  end if;
  if v_product_type = 'service' and (
    p_purchase_price <> 0
    or p_minimum_stock <> 0
    or coalesce(p_allow_sell_at_loss, false)
  ) then
    raise exception 'Services cannot use physical inventory settings.' using errcode = '22023';
  end if;
  if v_product_type = 'product'
     and not coalesce(p_allow_sell_at_loss, false)
     and p_purchase_price >= p_sale_price then
    raise exception 'Physical product sale price must be strictly higher than cost price.' using errcode = '22023';
  end if;
  if coalesce(p_allow_sell_at_loss, false) then
    if v_profile.role not in ('owner', 'admin') then
      raise exception 'Only owner or admin can authorize selling below cost.' using errcode = '42501';
    end if;
    if v_reason = '' then
      raise exception 'A loss sale override reason is required.' using errcode = '22023';
    end if;
  end if;

  if p_category_id is not null and not exists (
    select 1
    from public.product_categories
    where id = p_category_id
      and organization_id = v_profile.organization_id
  ) then
    raise exception 'Category does not belong to this organization.' using errcode = '42501';
  end if;
  if p_supplier_id is not null and not exists (
    select 1
    from public.suppliers
    where id = p_supplier_id
      and organization_id = v_profile.organization_id
  ) then
    raise exception 'Supplier does not belong to this organization.' using errcode = '42501';
  end if;
  if v_barcode is not null and exists (
    select 1
    from public.products
    where organization_id = v_profile.organization_id
      and barcode = v_barcode
  ) then
    raise exception 'This barcode is already used by another product.' using errcode = '23505';
  end if;

  insert into public.products (
    id,
    organization_id,
    branch_id,
    category_id,
    supplier_id,
    name,
    sku,
    barcode,
    type,
    purchase_price,
    sale_price,
    stock_quantity,
    minimum_stock,
    allow_sell_at_loss,
    sell_at_loss_reason,
    sell_at_loss_updated_at,
    sell_at_loss_updated_by,
    image_path,
    notes,
    is_active
  ) values (
    v_product_id,
    v_profile.organization_id,
    v_profile.branch_id,
    p_category_id,
    p_supplier_id,
    v_name,
    v_sku,
    v_barcode,
    v_product_type,
    case when v_product_type = 'service' then 0 else p_purchase_price end,
    p_sale_price,
    case when v_product_type = 'service' then 0 else p_opening_stock end,
    case when v_product_type = 'service' then 0 else p_minimum_stock end,
    case when v_product_type = 'service' then false else coalesce(p_allow_sell_at_loss, false) end,
    case when v_product_type = 'service' then '' else v_reason end,
    case
      when v_product_type = 'product' and coalesce(p_allow_sell_at_loss, false) then now()
      else null
    end,
    case
      when v_product_type = 'product' and coalesce(p_allow_sell_at_loss, false) then v_profile.id
      else null
    end,
    nullif(p_image_path, ''),
    nullif(btrim(p_notes), ''),
    coalesce(p_is_active, true)
  );

  if v_product_type = 'product' and p_opening_stock > 0 then
    v_lot_id := gen_random_uuid();
    insert into public.product_stock_lots (
      id,
      organization_id,
      branch_id,
      product_id,
      supplier_id,
      lot_number,
      purchase_date,
      quantity_received,
      quantity_remaining,
      unit_cost,
      notes,
      is_active,
      created_by
    ) values (
      v_lot_id,
      v_profile.organization_id,
      v_profile.branch_id,
      v_product_id,
      p_supplier_id,
      'OPENING-' || to_char(current_date, 'YYYYMMDD'),
      current_date,
      p_opening_stock,
      p_opening_stock,
      p_purchase_price,
      'Opening stock created with product.',
      true,
      v_profile.id
    );

    v_movement_id := gen_random_uuid();
    insert into public.stock_movements (
      id,
      organization_id,
      branch_id,
      product_id,
      stock_lot_id,
      movement_type,
      quantity,
      unit_cost,
      reference_type,
      reference_id,
      notes,
      created_by
    ) values (
      v_movement_id,
      v_profile.organization_id,
      v_profile.branch_id,
      v_product_id,
      v_lot_id,
      'opening_stock',
      p_opening_stock,
      p_purchase_price,
      'opening_stock',
      v_product_id,
      'Opening stock created with product.',
      v_profile.id
    );
  end if;

  return query select v_product_id, v_lot_id, v_movement_id;
end;
$$;

revoke all on function public.create_product_with_opening_stock(
  uuid, text, text, text, uuid, uuid, text, numeric, numeric, integer,
  integer, boolean, text, text, text, boolean
) from public;
revoke all on function public.create_product_with_opening_stock(
  uuid, text, text, text, uuid, uuid, text, numeric, numeric, integer,
  integer, boolean, text, text, text, boolean
) from anon;
revoke all on function public.create_product_with_opening_stock(
  uuid, text, text, text, uuid, uuid, text, numeric, numeric, integer,
  integer, boolean, text, text, text, boolean
) from service_role;
grant execute on function public.create_product_with_opening_stock(
  uuid, text, text, text, uuid, uuid, text, numeric, numeric, integer,
  integer, boolean, text, text, text, boolean
) to authenticated;

comment on function public.create_product_with_opening_stock(
  uuid, text, text, text, uuid, uuid, text, numeric, numeric, integer,
  integer, boolean, text, text, text, boolean
) is 'Atomically creates one catalog product and its optional opening FIFO lot and movement.';

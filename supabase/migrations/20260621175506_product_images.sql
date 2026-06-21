-- Product images are optional. Existing product rows remain valid without an image.
alter table public.products
  add column if not exists image_path text;

comment on column public.products.image_path is
  'Organization-scoped object path in the product-images Storage bucket.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  2097152,
  '{image/png,image/jpeg,image/webp}'
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Product images - public read" on storage.objects;
create policy "Product images - public read"
  on storage.objects for select
  to public
  using (bucket_id = 'product-images');

-- Catalog writers may write only inside:
--   {organization_id}/products/{product_id}/{generated_filename}
drop policy if exists "Product images - catalog writer insert" on storage.objects;
create policy "Product images - catalog writer insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[2] = 'products'
    and (storage.foldername(name))[3] is not null
    and (storage.foldername(name))[1] in (
      select organization_id::text
      from public.profiles
      where id = (select auth.uid())
        and role in ('owner', 'admin', 'manager')
        and is_active = true
    )
  );

drop policy if exists "Product images - catalog writer update" on storage.objects;
create policy "Product images - catalog writer update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[2] = 'products'
    and (storage.foldername(name))[1] in (
      select organization_id::text
      from public.profiles
      where id = (select auth.uid())
        and role in ('owner', 'admin', 'manager')
        and is_active = true
    )
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[2] = 'products'
    and (storage.foldername(name))[3] is not null
    and (storage.foldername(name))[1] in (
      select organization_id::text
      from public.profiles
      where id = (select auth.uid())
        and role in ('owner', 'admin', 'manager')
        and is_active = true
    )
  );

drop policy if exists "Product images - catalog writer delete" on storage.objects;
create policy "Product images - catalog writer delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[2] = 'products'
    and (storage.foldername(name))[1] in (
      select organization_id::text
      from public.profiles
      where id = (select auth.uid())
        and role in ('owner', 'admin', 'manager')
        and is_active = true
    )
  );

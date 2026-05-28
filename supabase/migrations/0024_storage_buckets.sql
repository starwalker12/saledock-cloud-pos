-- Migration 0024: Create Supabase Storage buckets and RLS policies for image uploads.
--
-- Buckets:
--   profile-pictures — user profile pictures (public read, user-scoped write)
--   public-branding  — shop logos / org branding (public read, org-scoped write)

-- ── Buckets ──────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-pictures', 'profile-pictures', true, 2097152, '{image/png,image/jpeg,image/webp}'),
  ('public-branding', 'public-branding', true, 2097152, '{image/png,image/jpeg,image/webp}')
on conflict (id) do nothing;

-- ── Profile-pictures policies ────────────────────────────────────────────────

drop policy if exists "Profile pictures — public read" on storage.objects;
create policy "Profile pictures — public read"
  on storage.objects for select
  to public
  using (bucket_id = 'profile-pictures');

drop policy if exists "Profile pictures — user insert" on storage.objects;
create policy "Profile pictures — user insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-pictures'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "Profile pictures — user update" on storage.objects;
create policy "Profile pictures — user update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-pictures'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "Profile pictures — user delete" on storage.objects;
create policy "Profile pictures — user delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-pictures'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- ── Public-branding policies ──────────────────────────────────────────────────

drop policy if exists "Public branding — public read" on storage.objects;
create policy "Public branding — public read"
  on storage.objects for select
  to public
  using (bucket_id = 'public-branding');

-- Org-scoped insert/update/delete — only org owners/admins can manage their org's branding folder
drop policy if exists "Public branding — org owner/admin insert" on storage.objects;
create policy "Public branding — org owner/admin insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'public-branding'
    and (
      -- Org-scoped branding upload
      (
        (storage.foldername(name))[1] = 'orgs'
        and (storage.foldername(name))[2] in (
          select organization_id::text
          from public.profiles
          where id = auth.uid()
            and role in ('owner', 'admin')
            and is_active = true
        )
      )
      or
      -- Temp upload during onboarding (no org yet)
      (
        (storage.foldername(name))[1] = 'temp'
        and (storage.foldername(name))[2] = auth.uid()::text
      )
    )
  );

drop policy if exists "Public branding — org owner/admin update" on storage.objects;
create policy "Public branding — org owner/admin update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'public-branding'
    and (storage.foldername(name))[1] = 'orgs'
    and (storage.foldername(name))[2] in (
      select organization_id::text
      from public.profiles
      where id = auth.uid()
        and role in ('owner', 'admin')
        and is_active = true
    )
  );

drop policy if exists "Public branding — org owner/admin delete" on storage.objects;
create policy "Public branding — org owner/admin delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'public-branding'
    and (
      -- Org-scoped branding delete
      (
        (storage.foldername(name))[1] = 'orgs'
        and (storage.foldername(name))[2] in (
          select organization_id::text
          from public.profiles
          where id = auth.uid()
            and role in ('owner', 'admin')
            and is_active = true
        )
      )
      or
      -- Temp upload delete during onboarding
      (
        (storage.foldername(name))[1] = 'temp'
        and (storage.foldername(name))[2] = auth.uid()::text
      )
    )
  );

-- ── Storage admin access (service_role) ───────────────────────────────────────

drop policy if exists "Storage admin full access" on storage.objects;
create policy "Storage admin full access"
  on storage.objects for all
  to service_role
  using (true)
  with check (true);

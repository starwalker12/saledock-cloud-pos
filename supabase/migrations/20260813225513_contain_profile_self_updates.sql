-- Restrict ordinary authenticated profile updates to the one supported
-- self-service field. Row ownership remains enforced by the existing
-- "Profiles can update themselves" RLS policy.
do $$
begin
  if not has_table_privilege('authenticated', 'public.profiles', 'update') then
    raise exception 'Expected authenticated to have table-level UPDATE on public.profiles';
  end if;
end;
$$;

revoke update on table public.profiles from authenticated;
grant update (profile_picture_url) on table public.profiles to authenticated;

do $$
begin
  if has_table_privilege('authenticated', 'public.profiles', 'update') then
    raise exception 'Authenticated table-level UPDATE on public.profiles survived containment';
  end if;

  if not has_column_privilege(
    'authenticated',
    'public.profiles',
    'profile_picture_url',
    'update'
  ) then
    raise exception 'Authenticated profile-picture self-service UPDATE was not granted';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name <> 'profile_picture_url'
      and has_column_privilege(
        'authenticated',
        'public.profiles',
        column_name,
        'update'
      )
  ) then
    raise exception 'Authenticated protected-column UPDATE on public.profiles survived containment';
  end if;
end;
$$;

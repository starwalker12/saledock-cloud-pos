-- Remove the historical Supabase public-schema default UPDATE grant from
-- anonymous callers. RLS already exposes no anonymous UPDATE policy, but the
-- table grant is unnecessary and broader than the application's auth model.
do $$
begin
  if not has_table_privilege('anon', 'public.profiles', 'update') then
    raise exception 'Expected anon to have table-level UPDATE on public.profiles';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and not has_column_privilege(
        'anon',
        'public.profiles',
        column_name,
        'update'
      )
  ) then
    raise exception 'Expected anon table UPDATE to cover every public.profiles column';
  end if;
end;
$$;

revoke update on table public.profiles from anon;

do $$
begin
  if has_table_privilege('anon', 'public.profiles', 'update') then
    raise exception 'Anon table-level UPDATE on public.profiles survived hardening';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and has_column_privilege(
        'anon',
        'public.profiles',
        column_name,
        'update'
      )
  ) then
    raise exception 'Anon column UPDATE on public.profiles survived hardening';
  end if;

  if has_table_privilege('authenticated', 'public.profiles', 'update') then
    raise exception 'Authenticated table-level UPDATE containment regressed';
  end if;

  if not has_column_privilege(
    'authenticated',
    'public.profiles',
    'profile_picture_url',
    'update'
  ) then
    raise exception 'Authenticated profile-picture self-service UPDATE regressed';
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
    raise exception 'Authenticated protected-column UPDATE containment regressed';
  end if;

  if not has_table_privilege('service_role', 'public.profiles', 'update') then
    raise exception 'Service-role profile management UPDATE regressed';
  end if;
end;
$$;

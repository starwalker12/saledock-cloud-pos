-- Fix function search path mutable for set_updated_at
alter function public.set_updated_at() set search_path = public, pg_temp;

-- Hardening definer functions executable by public
alter function public.current_organization_id() set search_path = public, pg_temp;
alter function public.current_user_role() set search_path = public, pg_temp;

revoke all on function public.current_organization_id() from public;
revoke all on function public.current_user_role() from public;

grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;

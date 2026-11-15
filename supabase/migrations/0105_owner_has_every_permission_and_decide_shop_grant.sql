-- 0105: the owner can do everything, and the vendor approval RPC is callable.
--
-- Two production faults, both found while tracing "The database denied this
-- request (42501)" when the owner approved a vendor:
--
--   1. 0100 revoked EXECUTE on public.decide_shop(...) from public, anon and
--      authenticated, to retire the legacy shop payouts. The vendor approval
--      console still calls decide_shop(), so PostgreSQL refused the call with
--      42501 before any permission check ran. 0104 used CREATE OR REPLACE,
--      which keeps the existing privileges, so the revoke was never undone.
--      decide_shop() enforces its own permission (marketplace.review), so
--      restoring EXECUTE for signed-in callers is safe; anon stays revoked.
--
--   2. bsdc.has_permission() only consulted public.role_permissions. Any
--      permission that was never seeded for 'owner' therefore refused the
--      main administrator. The owner is the platform's top role and must have
--      every permission, so the owner now passes the check directly.

grant execute on function public.decide_shop(uuid, boolean, text) to authenticated, service_role;

create or replace function bsdc.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select bsdc.actor_role() = 'owner'::bsdc_role
      or exists (
        select 1 from public.role_permissions r
        where r.role = bsdc.actor_role() and r.permission = p_permission
      );
$$;

comment on function bsdc.has_permission(text) is
  'True when the acting account is the owner (every permission) or its role holds the permission in public.role_permissions.';

-- 0114 — the panel's permission list and the server's permission check agree.
--
-- 0105 gave the owner every permission by short-circuiting
-- `bsdc.has_permission()`. What it did not change is `public.my_permissions()`,
-- which is the *other* half of the same question: `has_permission()` decides
-- whether a write is allowed, `my_permissions()` decides whether a panel is
-- drawn at all.
--
-- So an owner ended up in the worst possible state: every RPC they called
-- succeeded, and every control they needed was hidden, because the list the
-- browser received was still only `role_permissions` for 'owner'. Concretely,
-- this is why the marketplace settings page — the only place the 10/50/100
-- order package prices can be edited — rendered nothing for the account that
-- is allowed to edit them, and why the credit-purchase review queue appeared
-- to have no rows: the page hid itself before it ever asked.
--
-- The fix is to define the list in terms of the check, not beside it. The owner
-- gets `role_permissions` for its role plus every distinct permission any role
-- holds, which is exactly the set `has_permission()` says yes to. Every other
-- role is unchanged, byte for byte, so nothing about a manager's or an admin's
-- panel moves.
--
-- The owner check is written out rather than delegating to `has_permission()`
-- per permission name, because that would need a hardcoded catalogue to
-- enumerate — and a catalogue is the thing that drifts. Reading the same
-- `role_permissions` table that `has_permission()` reads cannot drift from it.

create or replace function public.my_permissions()
returns text[]
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select coalesce(
    array(
      select distinct r.permission
        from public.role_permissions r
       where r.role = bsdc.actor_role()
          -- The owner holds every permission, exactly as bsdc.has_permission()
          -- already answers for it (0105). Without this clause the owner is
          -- allowed to call an RPC whose control the panel does not draw.
          or bsdc.actor_role() = 'owner'::bsdc_role
       order by r.permission
    ),
    '{}'::text[]
  );
$$;

comment on function public.my_permissions() is
  'The permissions of the acting role, for drawing panels. Agrees with bsdc.has_permission(): the owner holds every permission any role holds.';

revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;

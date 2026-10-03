-- ---------------------------------------------------------------------------
-- The application role moves out of the JWT `role` claim.
--
-- PostgREST reserves `role`: it uses that claim to choose which Postgres role
-- a request runs as, and Supabase's third-party auth only accepts the value
-- "authenticated" (or "anon") there. Minting the BSDC application role into
-- `role` — member, creator, admin, … — therefore meant every authenticated
-- token named a Postgres role that does not exist, and PostgREST rejected the
-- role switch. The application role now travels in a separate `bsdc_role`
-- claim, and `role` always carries "authenticated".
--
-- This helper is the one place the claim was read, so it is the one place
-- that has to change. Nothing here alters a table, a policy or a type: the
-- function keeps its name, its return type and its default of 'member'.
-- ---------------------------------------------------------------------------

-- bsdc_role, not role. `role` is now always "authenticated" and is consumed by
-- PostgREST before the query runs; the application role lives in bsdc_role.
create or replace function bsdc.current_role_name()
returns text
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'bsdc_role', 'member')
$$;

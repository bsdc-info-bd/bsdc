-- ---------------------------------------------------------------------------
-- A function that demands a member is not an anonymous endpoint.
--
-- Postgres grants EXECUTE to PUBLIC on every function unless told otherwise,
-- and `anon` is inside PUBLIC. So every staff and admin routine in this schema
-- — setting a member's role, suspending an account, publishing a notice,
-- writing a redirect, editing the site configuration, opening an incident —
-- was reachable by a visitor who had never signed in. Nothing leaked: each of
-- them begins by asking for an identity, and a visitor has none, so the call
-- was refused *inside* after being accepted *outside*. That is a door that
-- only says no, and it spends a backend saying it.
--
-- 0046 did this for one function (`prune_feed_seen`), 0053 for the ten the
-- messenger round added. This file does it for the rest of the same class:
-- every function in `public` whose body asks `bsdc.require_permission`,
-- `bsdc.require_member` or `bsdc.require_staff` for an identity.
--
-- The rule is deliberately not "revoke from everything anonymous can reach":
-- a signed-out visitor *does* browse this site through the anonymous key, so
-- the reads the edge worker and the browser make — `feed_candidates`,
-- `seo_for_path`, `sitemap_urls`, `follow_redirect`, `global_search`, the
-- telemetry writers — keep their grant. `t26` proves that in the other
-- direction as well: it reads the edge functions' own source, extracts every
-- routine they call, and fails if any one of them stopped answering an
-- anonymous caller.
--
-- `authenticated` and `service_role` are granted explicitly, so nothing that
-- worked for a signed-in member, a moderator, an administrator or a scheduled
-- job changes. `t26` proves that too, by comparing the whole execute inventory
-- for those two roles before and after this file.
--
-- Re-running the file says the same thing twice.
-- ---------------------------------------------------------------------------

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype <> 'trigger'::regtype
      and not exists (
        select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
      )
      and p.prosrc ~ 'bsdc\.(require_permission|require_member|require_staff|require_role)\('
  loop
    execute format('revoke execute on function %s from public', fn.signature);
    execute format('grant execute on function %s to authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end $$;

comment on schema public is
  'Public schema: an anonymous caller may read what the site shows and send what a visitor may send; everything that asks for an identity is granted to authenticated and service_role instead of PUBLIC.';

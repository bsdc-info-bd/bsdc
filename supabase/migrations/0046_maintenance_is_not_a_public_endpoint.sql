-- ---------------------------------------------------------------------------
-- A maintenance routine is not a public endpoint.
--
-- `public.prune_feed_seen(p_days)` exists to throw away old rows from
-- `feed_seen`, the impression ledger that stops the feed showing a member the
-- same post twice. 0005 created it and 0006 granted it to `authenticated`:
--
--   grant execute on function public.prune_feed_seen(integer) to authenticated;
--
-- Three things are wrong with that as it stood.
--
-- 1. Nothing in any client calls it. The only reference outside the migrations
--    is the generated TypeScript signature in `main-site/src/lib/supabase/
--    types.ts`; there is no call site, and the fourteen applications never
--    invoke it. It is a scheduled-maintenance function that happens to be
--    published.
--
-- 2. `grant execute … to authenticated` does not remove the EXECUTE privilege
--    Postgres gives every function by default, which is granted to PUBLIC —
--    the pseudo-role that includes `anon`. So an anonymous visitor who had
--    never signed in could call it. Verified: an anonymous session calling
--    `select public.prune_feed_seen(0)` deleted every row in the table.
--
-- 3. `p_days` is unbounded, and it is used for the one thing the function is
--    for:
--
--      delete from public.feed_seen where seen_at < now() - make_interval(days => p_days);
--
--    `p_days = 0` deletes every impression at or before this instant — every
--    member's — and a negative value deletes rows stamped in the future, so it
--    is a full wipe either way. One unauthenticated HTTP POST was enough to
--    reset the whole community's feed state.
--
-- The fix does both halves. The function keeps its job (a maintenance caller
-- still deletes properly aged rows) but the argument is clamped to a sane
-- window and the execute privilege is limited to the role maintenance runs as.
-- Revoking from PUBLIC is what takes the privilege away from `anon`; the
-- explicit grant to `service_role` is what keeps the scheduled path working.
--
-- Creating a function twice is a no-op and re-issuing a grant or revoke is
-- too, so this file is safe to re-run.
-- ---------------------------------------------------------------------------

create or replace function public.prune_feed_seen(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  -- A week is the shortest window that cannot be called a wipe: the feed's own
  -- dedup only looks back a few days, so nothing useful is ever retained
  -- longer, and no argument a caller invents can shorten it further.
  v_days    integer := greatest(coalesce(p_days, 30), 7);
  v_deleted integer;
begin
  delete from public.feed_seen where seen_at < now() - make_interval(days => v_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Maintenance only: no client path calls this, and PUBLIC holds EXECUTE on a
-- new function by default, which includes `anon`.
revoke execute on function public.prune_feed_seen(integer) from public, anon, authenticated;
grant execute on function public.prune_feed_seen(integer) to service_role;

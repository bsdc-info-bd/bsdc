-- ---------------------------------------------------------------------------
-- The messenger's endpoints stop answering anonymous callers.
--
-- Postgres grants EXECUTE to PUBLIC on every function unless told otherwise,
-- and `authenticated` is a *subset* of PUBLIC — so `grant execute … to
-- authenticated` adds nothing that was not already there. `anon` is in PUBLIC
-- too. The messenger tables are locked down properly (`0051` grants nothing to
-- anonymous callers and t21 proves an anonymous read raises 42501), but the
-- functions that read them were reachable by anybody who could reach the API:
-- an anonymous POST to `toggle_message_reaction` or `conversation_messages`
-- entered the database, was refused by the defined guards inside, and spent a
-- backend doing it. A door that only answers "no" is still a door.
--
-- `purge_deleted_content` in 0050 shows the shape of the fix: revoke from
-- PUBLIC, then grant to the role that actually needs it. That is what happens
-- here for every function this round added — the nine messenger RPCs and the
-- member's own trash listing. `authenticated` keeps every one of them, which
-- t21 and t23 exercise as a signed-in member.
--
-- Re-running this file says exactly the same thing, so it is safe twice.
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
      and p.proname in (
        'my_deleted_content',
        'toggle_message_reaction',
        'mark_message_read',
        'toggle_message_pin',
        'toggle_message_star',
        'search_messages',
        'conversation_pins',
        'conversation_state',
        'conversation_messages',
        'saved_messages'
      )
  loop
    execute format('revoke execute on function %s from public', fn.signature);
    execute format('grant execute on function %s to authenticated', fn.signature);
  end loop;
end $$;

comment on function public.my_deleted_content(integer) is
  'The caller''s own trashed rows plus the comments they hid on their own posts; signed-in members only.';

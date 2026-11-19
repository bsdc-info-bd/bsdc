-- 0118 — the internal writers stop answering the door.
--
-- Three security-definer functions in the `bsdc` schema write to tables no client
-- may write, and none of them asks who is calling:
--
--   bsdc.audit(text, text, jsonb)        → public.audit_log
--   bsdc.note_deployment(text, text)     → bsdc.deployment_notes
--   bsdc.resolve_deployment_note(text)   → bsdc.deployment_notes
--
-- PostgreSQL grants EXECUTE on every new function to PUBLIC by default, and 0002
-- grants `usage on schema bsdc` to anon and authenticated. So all three were
-- callable by anyone holding only the publishable key. The effect is not
-- theoretical: an anonymous visitor could forge audit rows attributed to any
-- member (the actor is taken from the caller's own token, so a signed-in member
-- could frame another), overwrite a recorded deployment fault with arbitrary
-- text and reopen it, or mark a live fault as resolved so it disappears from the
-- log while the thing it describes is still broken. A log anyone can rewrite is
-- worse than no log.
--
-- 0049 closed this class of hole for the helpers that existed then, and 0068
-- revoked the four-argument audit overload. But the three-argument audit overload
-- from 0024 was never revoked, and the two deployment-note functions arrived in
-- 0056, after 0049's hand-written list. This migration closes the three that
-- slipped through, and only those three.
--
-- Why revoking is safe, checked against the catalogue rather than assumed:
--   * no RLS policy, column default, check constraint, or index expression names
--     any of the three, so nothing that runs as the caller needs their grant;
--   * no SECURITY INVOKER function calls any of them — every caller is a
--     SECURITY DEFINER function, which runs as the owner and needs no grant, or a
--     migration DO block, which also runs as the owner;
--   * no client or server code calls them by name.
-- The read-only helpers that policies genuinely name (actor_role, is_staff,
-- has_permission, can_read_channel, and the rest) keep their grants: they write
-- nothing, and revoking them would break the policies that call them as the
-- caller. That is the line 0049 drew, and this migration does not move it.

-- ---------------------------------------------------------------------------
-- The three writers. Revoke from PUBLIC (which is where the default grant
-- lives) and from the two client roles explicitly, so the intent is readable
-- without consulting the catalogue.
-- ---------------------------------------------------------------------------
revoke all on function bsdc.audit(text, text, jsonb) from public;
revoke all on function bsdc.audit(text, text, jsonb) from anon, authenticated;

revoke all on function bsdc.note_deployment(text, text) from public;
revoke all on function bsdc.note_deployment(text, text) from anon, authenticated;

revoke all on function bsdc.resolve_deployment_note(text) from public;
revoke all on function bsdc.resolve_deployment_note(text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Prove the closure took, at migration time.
--
-- If a later migration re-creates one of these functions (CREATE OR REPLACE
-- restores the default PUBLIC grant), or adds an overload under the same name,
-- this check fails the migration loudly instead of leaving a quiet hole. It
-- covers every overload of the three names, not just the signatures above.
-- ---------------------------------------------------------------------------
do $do$
declare
  v_open text;
begin
  select string_agg(
           format('bsdc.%s(%s)',
                  p.proname,
                  pg_get_function_identity_arguments(p.oid)),
           ', ')
    into v_open
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'bsdc'
     and p.proname in ('audit', 'note_deployment', 'resolve_deployment_note')
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'));

  if v_open is not null then
    raise exception 'an internal writer is still reachable by a client: %', v_open
      using errcode = '42501';
  end if;
end
$do$;

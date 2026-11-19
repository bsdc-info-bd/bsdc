-- 0121 — a poll that has votes keeps its options.
--
-- Editing a post re-wrote its poll by deleting every option and inserting the
-- new list. `poll_votes.option_id` references `poll_options` with `on delete
-- cascade`, so that rewrite was not a cosmetic update: correcting a typo in a
-- poll's body silently deleted every vote it had collected, and the option rows
-- came back with new ids so nothing could have been recovered.
--
-- Two things change here.
--
--   1. The trigger refuses to delete an option that carries a ballot. A poll
--      that has been voted on is a record of what people answered; its options
--      are frozen. Fixing the wording is still possible while nobody has voted.
--
--   2. Deleting the post itself still takes its options — and their votes — with
--      it. That is a cascade from `posts`, not an edit, and it arrives one
--      trigger deeper: the RI trigger on `posts` runs first and issues the child
--      delete, so `pg_trigger_depth()` is greater than one. A direct delete of
--      an option from a client is depth one and is refused.
--
-- The web client no longer deletes options it does not have to: `syncPoll` now
-- skips the rewrite when the labels are unchanged and refuses a rewrite on a
-- voted poll before touching the post, so a member reads a sentence instead of
-- a constraint error. This trigger is the half that protects the poll from every
-- other client — the Android app, a future admin tool, a console.

create or replace function bsdc.keep_poll_votes()
returns trigger
language plpgsql
as $$
begin
  -- A cascade from the post is the poll going away with its owner's permission.
  if pg_trigger_depth() > 1 then
    return old;
  end if;

  if exists (select 1 from public.poll_votes v where v.option_id = old.id) then
    raise exception using
      errcode = '23514',
      message = 'poll/options-locked',
      hint = 'A poll that has votes keeps its options; delete the post to discard them.';
  end if;

  return old;
end;
$$;

drop trigger if exists poll_options_keep_votes on public.poll_options;
create trigger poll_options_keep_votes
  before delete on public.poll_options
  for each row execute function bsdc.keep_poll_votes();

revoke all on function bsdc.keep_poll_votes() from public;
grant execute on function bsdc.keep_poll_votes() to service_role;

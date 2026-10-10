-- ---------------------------------------------------------------------------
-- 0066 — a reaction is a name, not a picture
--
-- The thread's reactions were stored as the emoji themselves: `❤️`, `👍`, and
-- so on, in a text column with nothing but a length check. That contradicts
-- the one rule this product states about its own surface — no emoji anywhere,
-- SVG icons only — and it had a second cost: the stored value was whatever a
-- client sent, so a reaction could be any string up to sixteen characters and
-- the set of reactions was a convention, not a fact the database knew.
--
-- Posts and comments already use the five words in the `bsdc_reaction` enum
-- (0007). A message now uses the same five, so one reaction vocabulary holds
-- across the site and the icon for each word is the same SVG everywhere.
--
-- Three things happen, in this order:
--
--   1. Stored emoji are translated to the nearest word, and the rows that held
--      them are removed. A member who reacted with both `❤️` and `🙏` to one
--      message ends with one `support`, because the primary key is
--      (message, member, reaction) and the translation does not invent a second
--      vote. This runs before the constraint in step 2 so the constraint can be
--      added to a table that already satisfies it.
--
--   2. A check constraint says which words are allowed. It is what a future
--      client cannot get around, and it is what makes "no emoji" a fact of the
--      schema rather than a hope about the front end.
--
--   3. `toggle_message_reaction` refuses anything else with 22023 before it
--      touches a row. It is replaced in place with its signature and grants
--      unchanged, and its membership and privacy checks are copied from 0051
--      without alteration.
--
-- Re-runnable: the translation only ever removes rows whose word is not in the
-- set, the constraint is dropped if present before it is added, and the function
-- is replaced rather than created. `t24` applies this file three times over.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- part 1 — stored emoji become the nearest word, and the emoji rows go
-- ---------------------------------------------------------------------------
insert into public.message_reactions (message_id, uid, reaction, created_at)
select
  r.message_id,
  r.uid,
  case r.reaction
    when '👍' then 'like'
    when '❤️' then 'support'
    when '❤'  then 'support'
    when '🙏' then 'support'
    when '😂' then 'celebrate'
    when '🎉' then 'celebrate'
    when '😮' then 'curious'
    else null
  end as reaction,
  r.created_at
from public.message_reactions r
where r.reaction not in ('like', 'insightful', 'celebrate', 'support', 'curious')
  and r.reaction in ('👍', '❤️', '❤', '🙏', '😂', '🎉', '😮')
on conflict (message_id, uid, reaction) do nothing;

delete from public.message_reactions
where reaction not in ('like', 'insightful', 'celebrate', 'support', 'curious');

-- ---------------------------------------------------------------------------
-- part 2 — the database says which words are reactions
-- ---------------------------------------------------------------------------
alter table public.message_reactions
  drop constraint if exists message_reactions_known_reaction;

alter table public.message_reactions
  add constraint message_reactions_known_reaction
  check (reaction in ('like', 'insightful', 'celebrate', 'support', 'curious'));

alter table public.message_reactions
  alter column reaction set default 'like';

-- ---------------------------------------------------------------------------
-- part 3 — the toggle refuses anything that is not one of the five words
-- ---------------------------------------------------------------------------
create or replace function public.toggle_message_reaction(
  p_message_id uuid,
  p_reaction   text
)
returns table (reacted boolean, reaction text, total integer)
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
-- The OUT column is called `reaction`, like the table column, so an
-- unqualified name in this body belongs to the column.
#variable_conflict use_column
declare
  v_uid  text := bsdc.current_uid();
  v_like text := coalesce(nullif(btrim(p_reaction), ''), 'like');
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if v_like not in ('like', 'insightful', 'celebrate', 'support', 'curious') then
    raise exception 'unknown reaction' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.messages m
    where m.id = p_message_id and bsdc.is_conversation_member(m.conversation_id, v_uid)
  ) then
    raise exception 'message not available' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.message_reactions r
    where r.message_id = p_message_id and r.uid = v_uid and r.reaction = v_like
  ) then
    delete from public.message_reactions r
      where r.message_id = p_message_id and r.uid = v_uid and r.reaction = v_like;
    return query select false, v_like, (
      select count(*)::integer from public.message_reactions r where r.message_id = p_message_id
    );
    -- `return query` appends to the result set; it does not leave the body.
    return;
  end if;

  insert into public.message_reactions (message_id, uid, reaction)
    values (p_message_id, v_uid, v_like)
    on conflict (message_id, uid, reaction) do nothing;

  return query select true, v_like, (
    select count(*)::integer from public.message_reactions r where r.message_id = p_message_id
  );
end;
$$;

grant execute on function public.toggle_message_reaction(uuid, text) to authenticated;

-- A promotion recorded in the database is a promotion everywhere.
--
-- 0055 settled where a member's authority comes from: `bsdc.actor_role()`
-- answers with the higher of what their profile row says and what their
-- verified address has proved. Every permission question in the admin panels
-- goes through it, so promoting somebody there takes effect immediately.
--
-- Row security did not get that update. `bsdc.is_staff()` still read one
-- place — the `staff` claim inside the Firebase token — and that claim is
-- written by an owner calling the claims endpoint. An admin who is not also
-- the bootstrap owner cannot mint claims for anybody else, so the moderator
-- they promoted kept a token that said "member" until that member happened to
-- be re-minted by someone who could. The result was the strangest kind of
-- half-working panel: the database agreed they were staff, the reports
-- rendered, and then every write behind `is_staff()` — deleting a reported
-- post, editing a profile that is not their own, removing a picture from the
-- bucket — quietly refused or silently matched no rows.
--
-- Both halves now answer from the same place.
--
-- The obvious objection is recursion: `profiles`' own read policy calls
-- `bsdc.is_staff()`, so a staff check that reads `profiles` looks like it
-- would evaluate the policy that called it and never stop. It does not, for
-- the reason `actor_role()` already relies on: this function is `security
-- definer` and owned by the migration role, which owns `profiles`, and a
-- table's owner reads it without its row policies unless the table forces
-- them. The lookup happens inside that definer boundary, so no policy is
-- evaluated and there is nothing to recurse into. t28 proves the behaviour
-- end to end (a visitor can still read every profile, and still is not staff).

create or replace function bsdc.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select coalesce(
           (current_setting('request.jwt.claims', true)::jsonb ->> 'staff')::boolean,
           false
         )
      or bsdc.role_rank(bsdc.actor_role()) >= bsdc.role_rank('moderator'::bsdc_role);
$$;

-- Same widening for the narrower test, so a function that only needs a
-- moderator agrees with one that needs staff.
create or replace function bsdc.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select bsdc.role_rank(bsdc.actor_role()) >= bsdc.role_rank('moderator'::bsdc_role);
$$;

comment on function bsdc.is_staff() is
  'True when the token says staff, or when bsdc.actor_role() is moderator or above. The database row is the record; the claim is only a copy of it. Security definer so the profiles lookup inside actor_role() does not re-enter the profiles policies.';
comment on function bsdc.is_moderator() is
  'True when bsdc.actor_role() is moderator or above, whoever put it there.';

-- Execution stays where 0055 left it, and this is deliberate rather than an
-- oversight. `bsdc.is_staff()` is called from inside row policies — the one on
-- `profiles` among them — and a policy expression is evaluated as whoever ran
-- the query. Revoking it from the roles that browse the site would take the
-- public profile read down with it, which is the opposite of the intent. What
-- 0055 closed was the other direction: functions that *act* as staff.
-- `create or replace` keeps the existing ACL, so the grants below are only
-- here to say it out loud.
grant execute on function bsdc.is_staff() to anon, authenticated, service_role;
grant execute on function bsdc.is_moderator() to anon, authenticated, service_role;

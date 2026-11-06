-- 0074 — a staff account can get in without being a member first.
--
-- The seven corporate consoles read `public.profiles` to decide who is signed in
-- and what they may do. That is the right place to read a role from — a token
-- claim is a copy, and a copy cannot be revoked without waiting for it to expire,
-- while a row can be demoted in one statement.
--
-- The problem was the other half. **Nothing ever created that row for staff.**
-- The member site creates it on first sign-in (`ensureProfile` in
-- `lib/profile/supabase-backend.ts`), so an operator who had once signed up at
-- bsdc.info.bd could sign into a console and everything worked. An operator
-- created in the Firebase console — which is how a first owner is created, and how
-- every staff account should be created, because a staff account is not a member
-- of the community — had no row, and every console answered:
--
--     This account has no profile in the community database.
--
-- with the correct password, the correct project and the correct role claim. The
-- instruction that followed was "sign up on the member site first", which is the
-- wrong instruction: it makes a staff account a member of the community it
-- moderates, gives it a public handle and a public feed, and makes the console's
-- authority depend on a signup form.
--
-- Two functions fix it, and they fix it in the database because the database is
-- the only place that can write `role` — the client key is granted UPDATE on a
-- column subset that excludes it (0002), which is deliberate and stays.
--
--   `public.provision_staff(p_display_name)` — if the caller has no row, create
--   one from their identity and the role their *verified* token already carries.
--   Called by the console at sign-in. It cannot elevate anybody: it copies the
--   role the claims endpoint minted, and it refuses when that role is not a staff
--   role, so an ordinary member cannot use it to mint themselves a console row
--   with moderator powers.
--
--   `public.bootstrap_staff_identity(...)` — the first owner, created from an
--   allowlisted email by the claims endpoint's service key. This is the bootstrap
--   that makes every later one possible.

-- ---------------------------------------------------------------- provision ---
--
-- What this function deliberately does not do:
--   * It does not give a member a handle. `username` stays null, which is a valid
--     profile and means staff accounts do not appear in @-mention search.
--   * It does not touch an existing row. A staff member who is also a community
--     member keeps their handle, their posts and their counters; only `role` and
--     `status` are reconciled, and only upward, from the verified token.
--   * It does not accept a role argument. The role comes from the token that the
--     caller's own signature proves, never from the request body.
create or replace function public.provision_staff(p_display_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid       text := bsdc.current_uid();
  v_claim     text := lower(coalesce(
                 current_setting('request.jwt.claims', true)::jsonb ->> 'bsdc_role',
                 current_setting('request.jwt.claims', true)::jsonb ->> 'role',
                 ''
               ));
  v_email     text := coalesce(
                 current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''
               );
  v_name      text := btrim(coalesce(p_display_name, ''));
  v_row       public.profiles;
  v_is_staff  boolean;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- The claims the platform mints put the application role in `bsdc_role`. A
  -- plain PostgREST role of `authenticated` is not a staff role and must never
  -- be read as one, which is why the fallback above is only consulted when
  -- `bsdc_role` is absent and is then checked against the same list.
  v_is_staff := v_claim in ('moderator', 'manager', 'admin', 'owner');

  -- A name has to come from somewhere. The token's email and the caller-supplied
  -- name are both acceptable; "Staff" is the last resort, and it is honest.
  if v_name = '' then
    v_name := split_part(v_email, '@', 1);
  end if;
  if v_name = '' then
    v_name := 'Staff';
  end if;
  v_name := left(v_name, 60);

  select * into v_row from public.profiles p where p.uid = v_uid;

  if not found then
    -- A new row. The role is the claimed one only when it is a staff role;
    -- otherwise the account is staff-adjacent in name only and the console will
    -- refuse it for lack of rank, which is a clearer answer than a locked door
    -- that says "no profile".
    insert into public.profiles (uid, display_name, role, status, language, onboarding_complete)
    values (
      v_uid,
      v_name,
      case when v_is_staff then v_claim::bsdc_role else 'member'::bsdc_role end,
      'active',
      'bn',
      true
    )
    returning * into v_row;

    insert into public.audit_log (actor_uid, action, subject, metadata)
    values (
      v_uid,
      'staff.provisioned',
      v_uid,
      jsonb_build_object('role', v_row.role, 'email_verified_in_token', v_email <> '')
    );

    return v_row;
  end if;

  -- An existing row. Reconcile the role, upward only: a staff member whose token
  -- says `admin` and whose row says `member` is under-privileged and would be
  -- refused by every console screen; one whose row says `owner` and whose token
  -- says `moderator` is a demotion that has not been applied yet, and the console
  -- should keep refusing until somebody with the authority writes it. The role
  -- change itself is `admin_set_role`, not this.
  if v_is_staff and bsdc.role_rank(v_claim) > bsdc.role_rank(v_row.role::text) then
    update public.profiles
       set role = v_claim::bsdc_role,
           updated_at = now()
     where uid = v_uid
    returning * into v_row;

    insert into public.audit_log (actor_uid, action, subject, metadata)
    values (
      v_uid,
      'staff.role_reconciled',
      v_uid,
      jsonb_build_object('from', 'token', 'from_value', v_claim, 'role', v_row.role)
    );
  end if;

  -- A suspended account stays suspended. Provisioning is not a way back in.
  if v_row.status <> 'active' then
    raise exception 'account/suspended' using errcode = '42501';
  end if;

  return v_row;
end;
$$;

revoke all on function public.provision_staff(text) from public;
grant execute on function public.provision_staff(text) to authenticated;

comment on function public.provision_staff(text) is
  'Creates the profile row a corporate console needs on first sign-in, from the role the verified token already carries. Never elevates beyond that token.';

-- ------------------------------------------------------------------- rank ---
--
-- The console's TypeScript and the database both need to compare roles, and they
-- must agree. `roleRank` in corporate-kit/src/domain/staff.ts is the browser half;
-- this is the database half. Two copies is one too many, and the alternative —
-- a check constraint per call site — is worse.
create or replace function bsdc.role_rank(p_role text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(p_role, ''))
    when 'owner'     then 7
    when 'admin'     then 6
    when 'manager'   then 5
    when 'moderator' then 4
    when 'vendor'    then 3
    when 'creator'   then 2
    when 'member'    then 1
    else 0
  end;
$$;

comment on function bsdc.role_rank(text) is
  'The one ranking. corporate-kit/src/domain/staff.ts roleRank() is the browser copy and must match.';

-- ------------------------------------------------------- the first owner ---
--
-- The claims endpoint holds a service-account key and can already mint an
-- elevated claim for an allowlisted email (`selfBootstrapRole` in
-- `claims-core.ts`). This is the missing other half: the row that claim then
-- needs. Without it, the first owner can sign in and is still told there is no
-- profile, which is the report.
--
-- Gated by the flush secret for the same reason the push and clean-up routines
-- are: no function in `functions/` holds a key that bypasses row level security,
-- so the capability has to be a secret the database checks itself.
create or replace function public.bootstrap_staff_identity(
  p_secret       text,
  p_uid          text,
  p_display_name text,
  p_role         text,
  p_email        text default ''
)
returns public.profiles
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_row public.profiles;
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_uid is null or length(btrim(p_uid)) < 8 then
    raise exception 'a uid is required' using errcode = '22023';
  end if;

  if lower(coalesce(p_role, '')) not in ('moderator', 'manager', 'admin', 'owner') then
    raise exception 'that is not a staff role' using errcode = '22023';
  end if;

  select * into v_row from public.profiles p where p.uid = p_uid;

  if found then
    return v_row;
  end if;

  insert into public.profiles (uid, display_name, role, status, language, onboarding_complete)
  values (
    p_uid,
    left(coalesce(nullif(btrim(p_display_name), ''), split_part(p_email, '@', 1), 'Staff'), 60),
    p_role::bsdc_role,
    'active',
    'bn',
    true
  )
  returning * into v_row;

  insert into public.audit_log (actor_uid, action, subject, metadata)
  values (
    null,
    'staff.bootstrapped',
    p_uid,
    jsonb_build_object('role', v_row.role, 'email', p_email)
  );

  return v_row;
end;
$$;

revoke all on function public.bootstrap_staff_identity(text, text, text, text, text) from public;
grant execute on function public.bootstrap_staff_identity(text, text, text, text, text)
  to anon, authenticated;

comment on function public.bootstrap_staff_identity(text, text, text, text, text) is
  'The first owner: creates the row an elevated claim needs, from an allowlisted email. Gated by the flush secret.';

-- ----------------------------------------------------- what a console asks ---
--
-- The console needs four things at sign-in and used to make three round trips:
-- the row, the rank, whether the account is suspended, and the number of things
-- waiting for attention. One call, because a console that loads in three
-- sequential requests feels broken on a phone.
create or replace function public.staff_identity()
returns table (
  uid            text,
  display_name   text,
  avatar_url     text,
  role           text,
  status         text,
  rank           integer,
  onboarded      boolean,
  created_at     timestamptz,
  last_seen_at   timestamptz
)
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Reading is a side effect worth recording: a console that knows it was opened
  -- is a console whose access log exists.
  update public.profiles p
     set last_seen_at = now()
   where p.uid = v_uid
     and (p.last_seen_at is null or p.last_seen_at < now() - interval '5 minutes');

  return query
  select
    p.uid,
    p.display_name,
    p.avatar_url,
    p.role::text,
    p.status::text,
    bsdc.role_rank(p.role::text),
    p.onboarding_complete,
    p.created_at,
    p.last_seen_at
  from public.profiles p
  where p.uid = v_uid;
end;
$$;

revoke all on function public.staff_identity() from public;
grant execute on function public.staff_identity() to authenticated;

comment on function public.staff_identity() is
  'One call for everything a console needs about the signed-in operator, including their rank.';

-- ------------------------------------------------------------- the grants ---
--
-- `provision_staff` writes to `profiles`, which the client key holds a column
-- subset for; a definer function is the only way it can write `role`, and that is
-- the point. It is granted to `authenticated` and nothing else.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.provision_staff(text)',
    'public.staff_identity()'
  ] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = split_part(split_part(fn, '.', 2), '(', 1)
    ) then
      raise exception '0074 did not create %', fn;
    end if;
  end loop;
end
$$;

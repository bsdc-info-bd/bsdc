-- ---------------------------------------------------------------------------
-- Row-level security, proved, not read.
--
-- A policy that reads correctly can still leak; the only trustworthy check is
-- to behave like PostgREST does — set the DB role and inject the JWT claims,
-- then attempt each access — and assert what actually happens. That is what
-- this script does against the schema built from nothing by db-push.
--
-- How it emulates a request:
--   * `set local role <role>` reproduces PostgREST switching into the role
--     the caller authenticated as (the `role` claim maps to a database role).
--   * `request.jwt.claims` is populated with exactly the payload the console's
--     bearer token carries: `sub` (the Firebase uid), the PostgREST `role`,
--     and BSDC's `bsdc_role`/`staff` claims. The bsdc.* helpers read it.
--
-- The whole run is one transaction that is rolled back, so the fixture leaves
-- nothing behind and the script is safe to run repeatedly.
--
-- An assertion failure raises an exception; with ON_ERROR_STOP the run fails
-- loudly instead of silently passing a broken schema.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on

-- --- tiny assertion helpers, session-local so nothing pollutes the schema ---
create or replace function pg_temp.expect_fail(p_sql text, p_sqlstate text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  -- Reaching here means the statement we expected to fail actually succeeded.
  raise exception 'expected failure [%], but it succeeded: %', p_sqlstate, p_sql;
exception
  -- Re-throw our own signal so "unexpectedly succeeded" still fails the run.
  when raise_exception then raise;
  when others then
    if p_sqlstate is not null and sqlstate <> p_sqlstate then
      raise exception 'expected sqlstate %, got % (%) for: %',
        p_sqlstate, sqlstate, sqlerrm, p_sql;
    end if;
end
$$;

create or replace function pg_temp.expect_rows(p_sql text, p_min int, p_max int default null)
returns void
language plpgsql
as $$
declare
  n bigint;
begin
  execute format('select count(*) from (%s) t', p_sql) into n;
  if n < p_min or (p_max is not null and n > p_max) then
    raise exception 'expected %..% rows, got % for: %',
      p_min, coalesce(p_max::text, 'any'), n, p_sql;
  end if;
end
$$;

create or replace function pg_temp.expect_affected(p_sql text, p_expected int)
returns void
language plpgsql
as $$
declare
  n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> p_expected then
    raise exception 'expected % affected, got % for: %', p_expected, n, p_sql;
  end if;
end
$$;

begin;

-- ---------------------------------------------------------------------------
-- Fixture. Written as the session user (the table owner, which bypasses RLS),
-- exactly how the superuser "sets the stage" that the actors then contest.
-- ---------------------------------------------------------------------------
insert into public.profiles (uid, username, display_name) values
  ('alice', 'alice', 'Alice A'),
  ('bob',   'bob',   'Bob B'),
  ('moda',  'moda',  'Mod A');
-- moda is the staff actor for corporate (DB-driven) authorization.
update public.profiles set role = 'admin' where uid = 'moda';

insert into public.posts (author_uid, slug, kind, status, visibility, title, excerpt, published_at) values
  ('alice', 'alice-pub',   'post', 'published', 'public', 'Alice public post', 'x', now()),
  ('alice', 'alice-draft', 'post', 'draft',     'public', 'Alice draft',       'x', null);

insert into public.feature_flags (key, enabled, audience, description)
  values ('p.flag', true, 'all', 'proof flag');

-- bob reports alice's post so the moderation path has something to show staff.
insert into public.reports (reporter_uid, subject_type, subject_id, reason)
  values ('bob', 'post', 'alice-pub', 'spam');

-- ===========================================================================
-- anonymous traffic
-- ===========================================================================
set local role anon;
select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', true);

-- an anonymous reader may see an active public profile and public flags,
select pg_temp.expect_rows('select uid from public.profiles where username = ''alice''', 1, 1);
select pg_temp.expect_rows('select key from public.feature_flags', 0, null);
-- but may not change anything,
select pg_temp.expect_fail('update public.profiles set bio = ''x'' where uid = ''alice''', '42501');
select pg_temp.expect_fail(
  'insert into public.posts (author_uid, slug, kind, excerpt) values (''alice'',''evil'',''post'',''x'')',
  '42501');
select pg_temp.expect_fail(
  'insert into public.feature_flags (key, enabled, audience) values (''evil'', true, ''all'')',
  '42501');
-- and the search log is deny-by-grant (reads happen through definer aggregators).
select pg_temp.expect_fail('select count(*) from public.search_log', '42501');

-- ===========================================================================
-- a member on their own data versus someone else's
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"alice","role":"authenticated","bsdc_role":"member"}', true);

-- her own profile she may edit,
select pg_temp.expect_affected(
  'update public.profiles set bio = ''mine'' where uid = ''alice''', 1);
-- someone else's profile she cannot (RLS filters it to zero rows),
select pg_temp.expect_affected(
  'update public.profiles set bio = ''hax'' where uid = ''bob''', 0);
-- and she may not promote herself: `role` has no member UPDATE grant.
select pg_temp.expect_fail(
  'update public.profiles set role = ''admin'' where uid = ''alice''', '42501');

-- her own posts include the draft; bob's actor below must not see it,
select pg_temp.expect_rows(
  'select slug from public.posts where slug in (''alice-pub'',''alice-draft'')', 2, 2);
-- and she cannot forge authorship of another member's post.
select pg_temp.expect_fail(
  'insert into public.posts (author_uid, slug, kind, excerpt) values (''bob'',''fake'',''post'',''x'')',
  '42501');
-- she may not read the audit log (staff only; filtered to nothing),
select pg_temp.expect_rows('select id from public.audit_log', 0, 0);
-- nor the search log (deny-by-grant),
select pg_temp.expect_fail('select count(*) from public.search_log', '42501');
-- the claims channel reports her as a plain member.
select pg_temp.expect_rows(
  'select 1 where bsdc.current_uid() = ''alice''
     and bsdc.current_role_name() = ''member''
     and not bsdc.is_staff()', 1, 1);

-- ---------------------------------------------------------------------------
-- Bootstrapping and the escalation hole this boots out.
-- A first-sign-in bootstrap inserts the minimal own row — and nothing more.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"newbie","role":"authenticated","bsdc_role":"member"}', true);
select pg_temp.expect_affected(
  'insert into public.profiles (uid, username, display_name) values (''newbie'', ''newbie'', ''Newbie'')',
  1);
select pg_temp.expect_rows(
  'select uid from public.profiles where uid = ''newbie''', 1, 1);

-- Regression for the self-insert escalation (see migration 0037): supplying
-- `role` on the own-row insert MUST be denied with insufficient_privilege,
-- otherwise a member mints themselves corporate admin in the database.
select set_config('request.jwt.claims',
  '{"sub":"mallory","role":"authenticated","bsdc_role":"member"}', true);
select pg_temp.expect_fail(
  'insert into public.profiles (uid, username, display_name, role) values (''mallory'', ''mallory'', ''Mallory'', ''admin'')',
  '42501');
-- And with the row blocked, corporate authorization must stay 'member'.
select pg_temp.expect_rows(
  'select 1 where bsdc.actor_role() = ''member'' and not bsdc.has_permission(''people.read'')',
  1, 1);

-- ===========================================================================
-- the moderation path: members file, direct reads are sealed, staff read
-- ===========================================================================
select set_config('request.jwt.claims',
  '{"sub":"alice","role":"authenticated","bsdc_role":"member"}', true);
-- a member can file a report,
select pg_temp.expect_affected(
  'insert into public.reports (reporter_uid, subject_type, subject_id, reason) values (''alice'', ''post'', ''alice-pub'', ''spam'')',
  1);
-- but cannot read it back: no SELECT grant, and a RETURNING insert needs one.
select pg_temp.expect_fail('select count(*) from public.reports', '42501');
select pg_temp.expect_fail(
  'insert into public.reports (reporter_uid, subject_type, subject_id, reason) values (''alice'', ''post'', ''alice-pub'', ''spam'') returning id',
  '42501');
-- members reach the queue only through moderation_queue(), which shows nothing.
select pg_temp.expect_rows('select id from public.moderation_queue(''open'', 10)', 0, 0);

select set_config('request.jwt.claims',
  '{"sub":"bob","role":"authenticated","bsdc_role":"member"}', true);
-- bob cannot see alice's draft but can see her published post,
select pg_temp.expect_rows('select slug from public.posts where slug = ''alice-draft''', 0, 0);
select pg_temp.expect_rows('select slug from public.posts where slug = ''alice-pub''', 1, 1);

-- ===========================================================================
-- staff: DB-driven corporate roles and the claim channel agree
-- ===========================================================================
select set_config('request.jwt.claims',
  '{"sub":"moda","role":"authenticated","bsdc_role":"admin","staff":true}', true);
-- the definer queue surfaces the report to staff,
select pg_temp.expect_rows('select id from public.moderation_queue(''open'', 10)', 1, null);
-- staff can read the audit log without an error,
select pg_temp.expect_rows('select id from public.audit_log', 0, null);
-- the claim channel says staff/admin,
select pg_temp.expect_rows(
  'select 1 where bsdc.current_role_name() = ''admin'' and bsdc.is_staff()', 1, 1);
-- and corporate (DB-driven) authorization resolves the seeded role.
select pg_temp.expect_rows(
  'select 1 where bsdc.actor_role() = ''admin''
     and bsdc.has_permission(''moderation.read'')
     and bsdc.has_permission(''people.read'')', 1, 1);

rollback;

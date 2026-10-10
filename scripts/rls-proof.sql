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
create or replace function pg_temp.expect_fail(p_sql text, p_sqlstate text, p_message text default null)
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
    -- A named failure must say what it is: a member who submits twice should
    -- read "you already applied", not a constraint name.
    if p_message is not null and position(p_message in sqlerrm) = 0 then
      raise exception 'expected the message to contain %, got: %', p_message, sqlerrm;
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

-- One row of every shape that carries a denormalised counter, each owned by
-- alice, so the assertions about those counters below are about the privilege
-- and not about a row the policy hides.
insert into public.pages (owner_uid, slug, name)
  values ('alice', 'alice-page', 'Alice Page');
insert into public.events (slug, title, mode, join_url, starts_at, ends_at, host_uid)
  values ('alice-meetup', 'Alice Meetup', 'online', 'https://meet.example/x',
          now() + interval '1 day', now() + interval '1 day 1 hour', 'alice');
insert into public.jobs (slug, title, company, city, poster_uid)
  values ('alice-job', 'Developer', 'BSD', 'Dhaka', 'alice');
insert into public.gigs (slug, title, description, client_uid)
  values ('alice-gig', 'Logo', 'Design a logo', 'alice');
insert into public.projects (slug, name, owner_uid)
  values ('alice-project', 'Project', 'alice');
insert into public.courses (slug, title, instructor_uid)
  values ('alice-course', 'Course', 'alice');
insert into public.shops (slug, name, owner_uid)
  values ('alice-shop', 'Alice Shop', 'alice');
insert into public.products (shop_id, slug, title, price)
  select id, 'alice-widget', 'Widget', 1000 from public.shops where slug = 'alice-shop';
insert into public.notices (code, title, body)
  values ('BSDC-NT-ABCD1234-5', 'Notice', 'body');

-- bob reports alice's post so the moderation path has something to show staff.
insert into public.reports (reporter_uid, subject_type, subject_id, reason)
  values ('bob', 'post', 'alice-pub', 'spam');

-- A comment on alice's published post. Reading it back is what exercises the
-- read policy that consults public.blocks, and writing it exercises the
-- counter trigger that maintains posts.comments_count.
insert into public.comments (post_id, author_uid, body)
  values ((select id from public.posts where slug = 'alice-pub'), 'bob', 'Nice one');

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
-- The feed's prune routine is maintenance for the whole table, and every
-- function Postgres creates carries EXECUTE for PUBLIC unless it is taken
-- away — so this used to be callable, and unbounded, from a logged-out
-- request. It is now closed to clients (0046).
select pg_temp.expect_fail('select public.prune_feed_seen() from public.feed_seen', '42501');
-- An anonymous reader sees comments on a public post. The read policy consults
-- the block list, so this only returns rows when `anon` may evaluate it — a
-- policy that reads a table the caller cannot SELECT fails the whole query
-- with 42501 rather than filtering anything.
select pg_temp.expect_rows(
  'select id from public.comments
    where post_id = (select id from public.posts where slug = ''alice-pub'')',
  1, null);

-- The feed's candidate stage is granted to anonymous readers as well, and it
-- runs as the caller, so the signals it reads must be readable too (0043).
-- Everything it may return still passes through row level security on posts.
select pg_temp.expect_rows('select post_id from public.feed_candidates(20)', 0, null);
-- The signals themselves stay private: both tables are self-only, and an
-- anonymous caller is nobody.
select pg_temp.expect_rows('select uid from public.topic_affinity', 0, 0);
select pg_temp.expect_rows('select uid from public.feed_seen', 0, 0);

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
-- The member write path, end to end. Every one of these statements was
-- reachable in the browser and every one of them failed at some point against
-- a schema whose policy text read correctly — which is the whole argument for
-- asserting behaviour instead of reading grants.
-- ---------------------------------------------------------------------------

-- She may publish her own post. The row passes the insert policy; the counter
-- trigger then has to reach `profiles.posts_count` as the owner, because
-- `authenticated` holds no UPDATE grant on that column (0002/0038). Without
-- SECURITY DEFINER on the trigger this insert fails with 42501 and the member
-- is told they do not have permission to publish.
select pg_temp.expect_affected(
  'insert into public.posts (author_uid, slug, kind, status, visibility, excerpt, published_at)
   values (''alice'', ''alice-new'', ''post'', ''published'', ''public'', ''x'', now())',
  1);
select pg_temp.expect_rows(
  'select slug from public.posts where slug = ''alice-new''', 1, 1);
-- The fixture's one published post plus this one: the counter moved with it.
select pg_temp.expect_rows(
  'select 1 from public.profiles where uid = ''alice'' and posts_count = 2', 1, 1);

-- She may attach a curated tag to her own post, and `tags.posts_count` follows
-- the same way — the tag vocabulary is staff-owned, the counter is trigger-owned.
select pg_temp.expect_affected(
  'insert into public.post_tags (post_id, tag_slug)
   select id, ''javascript'' from public.posts where slug = ''alice-new''', 1);
select pg_temp.expect_rows(
  'select 1 from public.tags where slug = ''javascript'' and posts_count = 1', 1, 1);

-- She may read the comments on a post she can see: the read policy consults the
-- block list, so a missing SELECT grant on public.blocks fails the query with
-- 42501 and no comment thread loads anywhere on the site.
select pg_temp.expect_rows(
  'select id from public.comments
    where post_id = (select id from public.posts where slug = ''alice-pub'')',
  1, null);

-- She may follow somebody (the same policy reads the block list), and unfollow.
select pg_temp.expect_affected(
  'insert into public.follows (follower_uid, followee_uid) values (''alice'', ''moda'')', 1);
select pg_temp.expect_rows(
  'select 1 from public.profiles where uid = ''moda'' and followers_count = 1', 1, 1);
select pg_temp.expect_affected('delete from public.follows where follower_uid = ''alice''', 1);

-- She may block, list and unblock: all three statements need SELECT on
-- public.blocks, and the policy still limits every read to her own rows.
select pg_temp.expect_affected(
  'insert into public.blocks (blocker_uid, blocked_uid, reason)
   values (''alice'', ''bob'', ''proof'')', 1);
select pg_temp.expect_rows(
  'select blocked_uid from public.blocks where blocker_uid = ''alice''', 1, 1);
select pg_temp.expect_affected('delete from public.blocks where blocked_uid = ''bob''', 1);
-- and it still hides everybody else's blocks from her.
select pg_temp.expect_rows(
  'select blocker_uid from public.blocks where blocker_uid <> ''alice''', 0, 0);

-- The feed runs as the caller — not as a definer — and reads the block list
-- while ranking, so a broken grant here empties the home page.
select pg_temp.expect_rows('select post_id from public.feed_candidates(20)', 0, null);

-- And the counters stay server-owned throughout: the browser cannot write one
-- even on its own row, which is exactly why the triggers above must run as the
-- owner.
select pg_temp.expect_fail(
  'update public.profiles set posts_count = 100 where uid = ''alice''', '42501');
select pg_temp.expect_fail(
  'update public.posts set likes_count = 100 where slug = ''alice-pub''', '42501');

-- The same is true of every derived column, and until 0042 it was not: 0008,
-- 0012, 0014, 0016, 0019, 0021, 0023, 0029 and 0031 each revoked a column
-- *after* granting UPDATE on the whole table, and a table-level grant covers
-- every column, so the revoke never applied. Each statement below was a
-- one-request forgery from the browser — a member could set their own page's
-- follower count, sell a product that was never sold, take a discount on an
-- order they had already placed, or publish their own notice.
select pg_temp.expect_fail(
  'update public.pages set followers_count = 100 where slug = ''alice-page''', '42501');
select pg_temp.expect_fail(
  'update public.pages set is_verified = true where slug = ''alice-page''', '42501');
select pg_temp.expect_fail(
  'update public.events set going_count = 100 where slug = ''alice-meetup''', '42501');
select pg_temp.expect_fail(
  'update public.jobs set applications_count = 100 where slug = ''alice-job''', '42501');
select pg_temp.expect_fail(
  'update public.jobs set views_count = 100 where slug = ''alice-job''', '42501');
select pg_temp.expect_fail(
  'update public.gigs set proposals_count = 100 where slug = ''alice-gig''', '42501');
select pg_temp.expect_fail(
  'update public.projects set stars_count = 100 where slug = ''alice-project''', '42501');
select pg_temp.expect_fail(
  'update public.courses set enrolled_count = 100 where slug = ''alice-course''', '42501');
select pg_temp.expect_fail(
  'update public.products set sold_count = 100 where slug = ''alice-widget''', '42501');
select pg_temp.expect_fail(
  'update public.products set stock = 100 where slug = ''alice-widget''', '42501');
select pg_temp.expect_fail(
  'update public.shops set orders_count = 100 where slug = ''alice-shop''', '42501');
select pg_temp.expect_fail(
  'update public.shops set status = ''active'' where slug = ''alice-shop''', '42501');
select pg_temp.expect_fail(
  'update public.shops set commission_bps = 0 where slug = ''alice-shop''', '42501');
select pg_temp.expect_fail(
  'update public.notices set status = ''published'' where code = ''BSDC-NT-ABCD1234-5''', '42501');
-- Closing the counters must not close the row: the columns the owner is
-- entitled to write are still writable, which is what 0042's grant-back list
-- is for.
select pg_temp.expect_affected(
  'update public.pages set about = ''updated'' where slug = ''alice-page''', 1);
select pg_temp.expect_affected(
  'update public.events set title = ''Alice Meetup II'' where slug = ''alice-meetup''', 1);
select pg_temp.expect_affected(
  'update public.jobs set title = ''Developer II'' where slug = ''alice-job''', 1);
select pg_temp.expect_affected(
  'update public.gigs set title = ''Logo II'' where slug = ''alice-gig''', 1);
select pg_temp.expect_affected(
  'update public.projects set tagline = ''tag'' where slug = ''alice-project''', 1);
select pg_temp.expect_affected(
  'update public.courses set title = ''Course II'' where slug = ''alice-course''', 1);
select pg_temp.expect_affected(
  'update public.shops set about = ''shop about'' where slug = ''alice-shop''', 1);
select pg_temp.expect_affected(
  'update public.products set price = 2000 where slug = ''alice-widget''', 1);
-- The SEO tables are grant-by-role, not deny-by-grant: a member may ask, and
-- the policy answers with zero rows instead of 42501 — otherwise every read of
-- `seo_overrides`, `redirects` or `brand_themes` fails for the consoles that
-- show them (0041).
select pg_temp.expect_rows('select path from public.seo_overrides', 0, 0);
select pg_temp.expect_rows('select from_path from public.redirects', 0, 0);
select pg_temp.expect_rows('select key from public.brand_themes', 0, 0);

-- ---------------------------------------------------------------------------
-- A double click is not an error. Each toggle below is called twice in a row;
-- before 0045 the second call raced the first into a duplicate-key failure
-- (`23505` on the primary key) whenever the two requests overlapped, which is
-- what a tapped like button produces. The second call must now simply answer
-- the opposite state.
-- ---------------------------------------------------------------------------
select pg_temp.expect_rows(
  'select 1 where public.toggle_bookmark(
     (select id from public.posts where slug = ''alice-pub'')) = true', 1, 1);
select pg_temp.expect_rows(
  'select 1 where public.toggle_bookmark(
     (select id from public.posts where slug = ''alice-pub'')) = false', 1, 1);
select pg_temp.expect_rows(
  'select 1 where public.toggle_page_follow(
     (select id from public.pages where slug = ''alice-page'')) = true', 1, 1);
select pg_temp.expect_rows(
  'select 1 where public.toggle_page_follow(
     (select id from public.pages where slug = ''alice-page'')) = false', 1, 1);
select pg_temp.expect_rows(
  'select 1 where public.toggle_project_star(
     (select id from public.projects where slug = ''alice-project'')) = true', 1, 1);
select pg_temp.expect_rows(
  'select 1 where public.toggle_project_star(
     (select id from public.projects where slug = ''alice-project'')) = false', 1, 1);
select pg_temp.expect_rows(
  'select 1 where public.toggle_wishlist(
     (select id from public.products where slug = ''alice-widget'')) = true', 1, 1);
select pg_temp.expect_rows(
  'select 1 where public.toggle_wishlist(
     (select id from public.products where slug = ''alice-widget'')) = false', 1, 1);
select pg_temp.expect_rows(
  'select reacted from public.toggle_reaction(
     (select id from public.posts where slug = ''alice-pub''), ''like'')', 1, 1);
select pg_temp.expect_rows(
  'select reacted from public.toggle_reaction(
     (select id from public.posts where slug = ''alice-pub''), ''like'')
   where reacted = false', 1, 1);
select pg_temp.expect_rows(
  'select reacted from public.toggle_comment_reaction(
     (select id from public.comments where post_id =
        (select id from public.posts where slug = ''alice-pub'') limit 1))', 1, 1);
select pg_temp.expect_rows(
  'select reacted from public.toggle_comment_reaction(
     (select id from public.comments where post_id =
        (select id from public.posts where slug = ''alice-pub'') limit 1))
   where reacted = false', 1, 1);

-- The two submissions name the duplicate instead of leaking the constraint.
select set_config('request.jwt.claims',
  '{"sub":"bob","role":"authenticated","bsdc_role":"member"}', true);
select pg_temp.expect_rows(
  'select public.apply_to_job(
     (select id from public.jobs where slug = ''alice-job''), ''please hire me'')', 1, 1);
select pg_temp.expect_fail(
  'select public.apply_to_job(
     (select id from public.jobs where slug = ''alice-job''), ''please hire me'')',
  '23505', 'job/already-applied');
select pg_temp.expect_rows(
  'select public.submit_proposal(
     (select id from public.gigs where slug = ''alice-gig''),
     ''I can absolutely do this work'', 1500, 10)', 1, 1);
select pg_temp.expect_fail(
  'select public.submit_proposal(
     (select id from public.gigs where slug = ''alice-gig''),
     ''I can absolutely do this work'', 1500, 10)',
  '23505', 'gig/already-proposed');

-- The statement the *loser* of a toggle race executes is now the clause below:
-- it reaches the database while the winner's row is already committed, so a
-- plain INSERT would fail with 23505. Put a row in place with the toggle
-- itself, then run the loser's clause against it.
-- (The harness — like the CI database — is a single connection, so the race
-- window itself cannot be held open here; this is the statement the second
-- request runs at that moment.)
select set_config('request.jwt.claims',
  '{"sub":"alice","role":"authenticated","bsdc_role":"member"}', true);
select public.toggle_reaction((select id from public.posts where slug = 'alice-pub'), 'like');
select public.toggle_comment_reaction(
  (select id from public.comments where post_id =
     (select id from public.posts where slug = 'alice-pub') limit 1));
select public.toggle_bookmark((select id from public.posts where slug = 'alice-pub'));
select public.toggle_page_follow((select id from public.pages where slug = 'alice-page'));
select public.toggle_project_star((select id from public.projects where slug = 'alice-project'));
select public.toggle_wishlist((select id from public.products where slug = 'alice-widget'));

-- The reaction's clause updates in place, so it affects the row it collided
-- with — and the counter must not move, because the trigger only counts
-- INSERT and DELETE.
select pg_temp.expect_affected(
  'insert into public.post_reactions (post_id, uid, reaction)
   select id, ''alice'', ''insightful'' from public.posts where slug = ''alice-pub''
   on conflict (post_id, uid) do update set reaction = excluded.reaction', 1);
select pg_temp.expect_rows(
  'select 1 from public.posts where slug = ''alice-pub'' and likes_count = 1', 1, 1);
select pg_temp.expect_affected(
  'insert into public.comment_reactions (comment_id, uid)
   select c.id, ''alice'' from public.comments c
     join public.posts p on p.id = c.post_id where p.slug = ''alice-pub'' limit 1
   on conflict (comment_id, uid) do nothing', 0);
select pg_temp.expect_affected(
  'insert into public.bookmarks (uid, post_id)
   select ''alice'', id from public.posts where slug = ''alice-pub''
   on conflict (uid, post_id) do nothing', 0);
select pg_temp.expect_affected(
  'insert into public.page_followers (page_id, uid)
   select id, ''alice'' from public.pages where slug = ''alice-page''
   on conflict (page_id, uid) do nothing', 0);
select pg_temp.expect_affected(
  'insert into public.project_stars (project_id, uid)
   select id, ''alice'' from public.projects where slug = ''alice-project''
   on conflict (project_id, uid) do nothing', 0);
select pg_temp.expect_affected(
  'insert into public.wishlist_items (uid, product_id)
   select ''alice'', id from public.products where slug = ''alice-widget''
   on conflict (uid, product_id) do nothing', 0);
-- A signed-in member is refused as well: pruning is a maintenance action,
-- not a member action, and it is bounded even for the role that may run it.
select pg_temp.expect_fail('select public.prune_feed_seen(0)', '42501');
-- The clamp is the second half of the fix: a zero-day prune never returns a
-- wipe, because the routine's shortest window is a week. Run as the owner,
-- who keeps the privilege, a fresh impression must survive it.
reset role;
select pg_temp.expect_rows('select public.prune_feed_seen(0) as deleted where public.prune_feed_seen(0) = 0', 1, 1);
set local role authenticated;

-- And it is still the caller's own row: the clause cannot plant one on
-- somebody else's behalf, because the insert policy checks the owner.
select pg_temp.expect_fail(
  'insert into public.bookmarks (uid, post_id)
   select ''bob'', id from public.posts where slug = ''alice-pub''
   on conflict (uid, post_id) do nothing', '42501');

-- ---------------------------------------------------------------------------
-- Profile bootstrap and onboarding, plus the escalation hole this closes.
-- A first sign-in inserts only a bare own row. Onboarding then writes the
-- exact member-owned payload used by the browser and claims the chosen handle.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"newbie","role":"authenticated","bsdc_role":"member"}', true);
select pg_temp.expect_affected(
  'insert into public.profiles (uid, username, display_name) values (''newbie'', null, ''Newbie'')',
  1);
select pg_temp.expect_rows(
  'select uid from public.profiles where uid = ''newbie'' and username is null', 1, 1);

-- This is the source payload in onboardingInsert(): all editable columns are
-- accepted, while database-owned verification/activity columns are absent.
select set_config('request.jwt.claims',
  '{"sub":"onboarding","role":"authenticated","bsdc_role":"member"}', true);
select pg_temp.expect_affected(
  'insert into public.profiles (
     uid, username, display_name, bio, avatar_url, location, website,
     skills, interests, language, onboarding_complete, notifications, privacy
   ) values (
     ''onboarding'', null, ''Onboarding Member'', ''A short bio'',
     ''https://images.example/avatar.png'', ''Dhaka'', ''https://member.example'',
     array[''typescript''], array[''open-source''], ''en'', true,
     ''{"followers":true,"comments":true,"mentions":true,"messages":true,"digest":true}''::jsonb,
     ''{"discoverable":true,"showActivity":true,"showEmail":false}''::jsonb
   )',
  1);
select pg_temp.expect_affected(
  'update public.profiles
     set display_name = ''Onboarding Member Updated'', bio = ''Updated bio''
   where uid = ''onboarding''',
  1);
select pg_temp.expect_rows(
  'select uid from public.claim_username(''onboarding'')
   where uid = ''onboarding'' and username = ''onboarding''',
  1, 1);

-- Regression for the self-insert escalation (see migrations 0037/0038):
-- state-owned profile columns MUST remain unavailable to a member, otherwise a
-- member can mint authority or falsify verification/activity on their own row.
select set_config('request.jwt.claims',
  '{"sub":"mallory","role":"authenticated","bsdc_role":"member"}', true);
select pg_temp.expect_fail(
  'insert into public.profiles (uid, username, display_name, role) values (''mallory'', ''mallory'', ''Mallory'', ''admin'')',
  '42501');
select pg_temp.expect_fail(
  'insert into public.profiles (uid, username, display_name, email_verified) values (''mallory'', ''mallory'', ''Mallory'', true)',
  '42501');
select pg_temp.expect_affected(
  'insert into public.profiles (uid, username, display_name) values (''mallory'', ''mallory'', ''Mallory'')',
  1);
select pg_temp.expect_fail(
  'update public.profiles set last_seen_at = now() where uid = ''mallory''',
  '42501');
-- And with the privileged insert blocked, corporate authorization stays member.
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
-- and the SEO tables the admin console reads directly: the policies gate them
-- on `seo.manage`/`brand.manage`, so a staff read must return rows rather than
-- "permission denied for table seo_overrides" (0041).
select pg_temp.expect_rows('select path from public.seo_overrides', 0, null);
select pg_temp.expect_rows('select from_path from public.redirects', 0, null);
select pg_temp.expect_rows('select key from public.brand_themes', 0, null);
-- the claim channel says staff/admin,
select pg_temp.expect_rows(
  'select 1 where bsdc.current_role_name() = ''admin'' and bsdc.is_staff()', 1, 1);
-- and corporate (DB-driven) authorization resolves the seeded role.
select pg_temp.expect_rows(
  'select 1 where bsdc.actor_role() = ''admin''
     and bsdc.has_permission(''moderation.read'')
     and bsdc.has_permission(''people.read'')', 1, 1);

-- Staff may create the two things those screens can already edit: the
-- policies on `custom_pages` and `certificate_templates` have always allowed
-- it, but the grant list stopped at update and delete, so "new page" was
-- refused with 42501 before the policy was ever consulted (0044).
select pg_temp.expect_affected(
  'insert into public.custom_pages (slug, title, status)
   values (''about-us'', ''About us'', ''draft'')', 1);
select pg_temp.expect_affected(
  'insert into public.certificate_templates (key, name)
   values (''workshop'', ''Workshop certificate'')', 1);
-- The same grant does not extend to members: the policy is what refuses them.
select set_config('request.jwt.claims',
  '{"sub":"alice","role":"authenticated","bsdc_role":"member"}', true);
select pg_temp.expect_fail(
  'insert into public.custom_pages (slug, title, status)
   values (''members-page'', ''Members page'', ''draft'')', '42501');
select pg_temp.expect_fail(
  'insert into public.certificate_templates (key, name)
   values (''members-template'', ''Members template'')', '42501');

rollback;

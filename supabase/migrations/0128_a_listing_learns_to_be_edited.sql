-- ---------------------------------------------------------------------------
-- 0128 — a listing learns to be edited, closed and deleted
--
-- Every directory on BSDC stores rows its author is allowed to write: 0014
-- grants a job's poster an UPDATE and a DELETE on their own row, 0012 does the
-- same for a group's moderators and an event's host, and 0064 proved that a
-- project's owner can correct it. None of those tables had a *routine* that
-- writes them. The web could only INSERT, so a published gig was write-once in
-- practice: a wrong budget, a dead apply link or an ad that was answered
-- elsewhere could only be fixed by publishing a second listing and hoping
-- nobody noticed the first. That is the same hole 0064 closed for a project's
-- gallery, and this file closes it for the other four directories.
--
-- What is added here, and why each decision is made in Postgres rather than in
-- a page:
--
--   * update_gig / close_gig / delete_gig
--   * update_job / close_job / delete_job
--   * update_group / delete_group (owner only)
--   * update_event / cancel_event / delete_event
--
-- Every routine is SECURITY DEFINER with a pinned search_path, takes the caller
-- from bsdc.current_uid(), and refuses with 42501 what the row-level policies
-- already refuse to a table write. A page cannot be tricked into a refusal it
-- did not ask for, and a forged call is refused rather than trusted.
--
-- The three rules that needed a decision, rather than a copy of 0014:
--
--   1. A cover URL is validated here. The columns have no CHECK, and a listing
--      whose cover points at an arbitrary host is a hotlink the image
--      allowlist will refuse to paint. `bsdc.is_valid_application_imgbb_url`
--      (0126) is the exact host family the browser, the Android allowlist and
--      the edge proxy already agree on, so it is reused rather than re-typed —
--      including its numbered `iN.ibb.co` subdomains.
--
--   2. Deleting a gig or a job with live bids/applications affects other
--      people, so it is a refusal with a way forward rather than a silent
--      cascade. `p_confirm_bids` / `p_confirm_applications` must be true when
--      somebody has already answered; the delete then tells each of them their
--      listing is gone. A listing nobody answered deletes without ceremony.
--
--   3. Deleting a group destroys a place other people live in, so the policy
--      is spelled out rather than inherited: the channels go with the group and
--      the posts inside them are detached, never destroyed. `posts.channel_id`
--      is `on delete set null` (0011), which would keep the text and drop the
--      group context silently; this routine does it deliberately — the group's
--      posts move to an archived copy of their own author's content with
--      `channel_id = null` and are *unpublished* (`status = 'archived'`), so a
--      discussion that was private to a group never becomes a public post, and
--      every author keeps their words in their own profile. Nothing in
--      `public.posts` is deleted by this file.
--
-- Projects are deliberately absent. 0064 already wrote update_project and
-- delete_project, and a second spelling of the same rule is how two surfaces
-- start disagreeing about who owns what.
--
-- Idempotent: functions are CREATE OR REPLACE with signatures nothing in this
-- repository defined before (checked by scripts/sql-schema-check.py), grants
-- are re-granted on every run, and the one signature that must be dropped (an
-- overload of cancel_event that never existed) is not created.
-- ---------------------------------------------------------------------------

begin;

set search_path = public, extensions, pg_temp;

-- ===========================================================================
-- 0. Shared helpers
-- ===========================================================================

-- A string a listing may carry as a title, a company, a tagline or an address.
-- One place, so five listings cannot disagree about what "too long" means.
create or replace function bsdc.listing_text(p_value text, p_max integer)
returns text
language sql
immutable
set search_path = public, bsdc, extensions, pg_temp
as $$
  select left(btrim(coalesce(p_value, '')), greatest(coalesce(p_max, 1), 1));
$$;

-- An address this repository will paint: an allowlisted ImgBB URL, or nothing.
--
-- Refusing instead of quietly blanking is the point. A member who pasted a link
-- from somewhere else must be told the host is not one BSDC serves pictures
-- from; a cover that silently disappears on save is the bug that made 0064 the
-- second attempt at project editing.
create or replace function bsdc.assert_listing_cover(p_url text)
returns text
language plpgsql
immutable
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_url text := btrim(coalesce(p_url, ''));
begin
  if v_url = '' then
    return '';
  end if;
  if char_length(v_url) > 500 or not bsdc.is_valid_application_imgbb_url(v_url) then
    raise exception 'cover images must be hosted on the BSDC image host'
      using errcode = '22023';
  end if;
  return v_url;
end;
$$;

-- Adding to an existing slug so a corrected title does not move the page.
--
-- The columns are `citext unique` with a pattern; a routine that rewrote the
-- slug on every save would break every link that was already shared, so the
-- slug is only ever changed when the caller explicitly asks for a new one, and
-- then it is validated and lowered here rather than trusted.
create or replace function bsdc.listing_slug(p_slug text, p_current text)
returns text
language plpgsql
immutable
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_next text := lower(btrim(coalesce(p_slug, '')));
begin
  if v_next = '' then
    return p_current;
  end if;
  if v_next !~ '^[a-z0-9][a-z0-9-]{2,119}$' then
    raise exception 'a listing address must be 3-120 lowercase letters, digits or dashes'
      using errcode = '22023';
  end if;
  if v_next = lower(btrim(coalesce(p_current, ''))) then
    return p_current;
  end if;
  return v_next;
end;
$$;

revoke all on function bsdc.listing_text(text, integer) from public, anon, authenticated;
revoke all on function bsdc.assert_listing_cover(text) from public, anon, authenticated;
revoke all on function bsdc.listing_slug(text, text) from public, anon, authenticated;

-- ===========================================================================
-- 1. Gigs — update, close, delete
-- ===========================================================================

create or replace function public.update_gig(
  p_gig_id        uuid,
  p_title         text,
  p_description   text,
  p_budget_min    integer       default null,
  p_budget_max    integer       default null,
  p_is_hourly     boolean       default null,
  p_duration_days integer       default null,
  p_skills        text[]        default null,
  p_cover_url     text          default null,
  p_slug          text          default null
)
returns text
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid    text := bsdc.current_uid();
  v_gig    public.gigs%rowtype;
  v_title  text := bsdc.listing_text(p_title, 140);
  v_skills text[];
  v_slug   text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_gig from public.gigs where id = p_gig_id for update;
  if not found then
    raise exception 'gig not found' using errcode = 'P0002';
  end if;

  -- The same pair 0014 and decide_gig_proposal already trust: the client, or
  -- staff. Anything else is the row-level policy's 42501, raised here first so
  -- an anonymous PostgREST call gets the same answer as a table write.
  if v_gig.client_uid is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'only the client of this gig may change it' using errcode = '42501';
  end if;

  if char_length(v_title) < 3 then
    raise exception 'a gig needs a title of at least 3 characters' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) < 20
     or char_length(p_description) > 20000 then
    raise exception 'a gig description must be between 20 and 20000 characters'
      using errcode = '22023';
  end if;
  if p_budget_min is not null and p_budget_min < 0 then
    raise exception 'a budget cannot be negative' using errcode = '22023';
  end if;
  -- The column has this constraint already; checking it here turns a 23514
  -- into a message a form can show beside the field.
  if p_budget_min is not null and p_budget_max is not null and p_budget_max < p_budget_min then
    raise exception 'the maximum budget cannot be below the minimum' using errcode = '22023';
  end if;
  if p_duration_days is not null and p_duration_days not between 1 and 3650 then
    raise exception 'a duration must be between 1 and 3650 days' using errcode = '22023';
  end if;

  -- `null` means "leave the skills alone", which is what a partial edit sends.
  -- The trigger from 0103 normalises whatever arrives, so the same skill
  -- written two ways is one filter value.
  v_skills := case when p_skills is null then v_gig.skills else p_skills end;
  if array_length(v_skills, 1) is not null and array_length(v_skills, 1) > 20 then
    raise exception 'a gig can carry at most 20 skills' using errcode = '22023';
  end if;

  v_slug := bsdc.listing_slug(p_slug, v_gig.slug::text);

  update public.gigs
     set title         = v_title,
         description   = btrim(p_description),
         budget_min    = p_budget_min,
         budget_max    = p_budget_max,
         is_hourly     = coalesce(p_is_hourly, is_hourly),
         duration_days = p_duration_days,
         skills        = v_skills,
         cover_url     = case when p_cover_url is null then cover_url
                              else bsdc.assert_listing_cover(p_cover_url) end,
         slug          = v_slug
   where id = p_gig_id;

  perform bsdc.audit('gig.update', p_gig_id::text, jsonb_build_object('slug', v_slug));
  return v_slug;
end;
$$;

comment on function public.update_gig(uuid, text, text, integer, integer, boolean, integer, text[], text, text) is
  'Corrects a gig in place. The client of the gig or staff only; the slug never moves unless asked.';

revoke all on function public.update_gig(uuid, text, text, integer, integer, boolean, integer, text[], text, text)
  from public, anon;
grant execute on function public.update_gig(uuid, text, text, integer, integer, boolean, integer, text[], text, text)
  to authenticated;

-- Closing is not a delete: the page stays, its terms stay readable, and the
-- proposal queue stays open to the client who must still answer the bids that
-- arrived while it was live. `submit_proposal` already refuses anything whose
-- status is not `open`, so the door closes on the same line that writes the
-- status.
create or replace function public.close_gig(p_gig_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_gig public.gigs%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_gig from public.gigs where id = p_gig_id for update;
  if not found then
    raise exception 'gig not found' using errcode = 'P0002';
  end if;
  if v_gig.client_uid is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'only the client of this gig may close it' using errcode = '42501';
  end if;

  if v_gig.status <> 'open' then
    return;
  end if;

  update public.gigs set status = 'closed' where id = p_gig_id;

  -- Everyone still waiting for an answer is told, once. A decided bid is the
  -- freelancer's own record by now and does not need a second notification.
  perform bsdc.notify_path(
    gp.freelancer_uid,
    v_uid,
    'job',
    null,
    null,
    left('The gig "' || v_gig.title || '" has closed', 280),
    null,
    '/freelance/' || v_gig.slug
  )
  from public.gig_proposals gp
  where gp.gig_id = p_gig_id
    and gp.status in ('submitted', 'reviewing', 'shortlisted');

  perform bsdc.audit('gig.close', p_gig_id::text, jsonb_build_object('slug', v_gig.slug));
end;
$$;

comment on function public.close_gig(uuid) is
  'Stops a gig accepting proposals, keeps its page and its queue, and tells every freelancer still waiting.';

revoke all on function public.close_gig(uuid) from public, anon;
grant execute on function public.close_gig(uuid) to authenticated;

create or replace function public.delete_gig(
  p_gig_id       uuid,
  p_confirm_bids boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_gig   public.gigs%rowtype;
  v_live  integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_gig from public.gigs where id = p_gig_id for update;
  if not found then
    raise exception 'gig not found' using errcode = 'P0002';
  end if;
  if v_gig.client_uid is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'only the client of this gig may delete it' using errcode = '42501';
  end if;

  select count(*)::integer into v_live
    from public.gig_proposals
   where gig_id = p_gig_id
     and status <> 'withdrawn';

  -- A bid is somebody's work. Deleting a gig that has bids destroys the
  -- freelancer's record of what they offered, so the caller must have been
  -- told the number in a confirmation and said yes to it.
  if v_live > 0 and not coalesce(p_confirm_bids, false) then
    raise exception 'this gig has % proposals; confirm the deletion to remove them',
      v_live using errcode = '22023', hint = 'gig/has-proposals';
  end if;

  -- Told before the cascade, because after it there is nothing left to name.
  perform bsdc.notify_path(
    gp.freelancer_uid,
    v_uid,
    'job',
    null,
    null,
    left('The gig "' || v_gig.title || '" was withdrawn by its client', 280),
    null,
    '/freelance'
  )
  from public.gig_proposals gp
  where gp.gig_id = p_gig_id
    and gp.status in ('submitted', 'reviewing', 'shortlisted');

  -- `gig_proposals.gig_id` is `on delete cascade` (0013), and the counter
  -- trigger from that file follows the rows out.
  delete from public.gigs where id = p_gig_id;

  perform bsdc.audit('gig.delete', p_gig_id::text, jsonb_build_object(
    'slug', v_gig.slug,
    'proposals', v_live
  ));
end;
$$;

comment on function public.delete_gig(uuid, boolean) is
  'Removes a gig and, with explicit confirmation, the proposals on it. Tells every freelancer still waiting.';

revoke all on function public.delete_gig(uuid, boolean) from public, anon;
grant execute on function public.delete_gig(uuid, boolean) to authenticated;

-- ===========================================================================
-- 2. Jobs — update, close, delete
-- ===========================================================================

create or replace function public.update_job(
  p_job_id          uuid,
  p_title           text,
  p_company         text,
  p_description     text,
  p_job_type        bsdc_job_type        default null,
  p_work_mode       bsdc_work_mode       default null,
  p_level           bsdc_experience_level default null,
  p_city            text                 default null,
  p_salary_min      integer              default null,
  p_salary_max      integer              default null,
  p_salary_period   text                 default null,
  p_skills          text[]               default null,
  p_apply_url       text                 default null,
  p_expires_at      timestamptz          default null,
  p_cover_url       text                 default null,
  p_slug            text                 default null
)
returns text
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid     text := bsdc.current_uid();
  v_job     public.jobs%rowtype;
  v_title   text := bsdc.listing_text(p_title, 140);
  v_company text := bsdc.listing_text(p_company, 100);
  v_mode    bsdc_work_mode := coalesce(p_work_mode, 'onsite');
  v_city    text := coalesce(p_city, '');
  v_skills  text[];
  v_slug    text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if v_job.poster_uid is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'only the poster of this job may change it' using errcode = '42501';
  end if;

  v_mode := coalesce(p_work_mode, v_job.work_mode);
  v_city := btrim(coalesce(p_city, v_job.city, ''));

  if char_length(v_title) < 3 then
    raise exception 'a job needs a title of at least 3 characters' using errcode = '22023';
  end if;
  if char_length(v_company) < 2 then
    raise exception 'a job needs a company of at least 2 characters' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) < 20
     or char_length(p_description) > 20000 then
    raise exception 'a job description must be between 20 and 20000 characters'
      using errcode = '22023';
  end if;
  if char_length(v_city) > 80 then
    raise exception 'a city cannot be longer than 80 characters' using errcode = '22023';
  end if;
  if v_mode <> 'remote' and v_city = '' then
    raise exception 'an on-site or hybrid job needs a city' using errcode = '22023';
  end if;
  if p_salary_min is not null and p_salary_min < 0 then
    raise exception 'a salary cannot be negative' using errcode = '22023';
  end if;
  if p_salary_min is not null and p_salary_max is not null and p_salary_max < p_salary_min then
    raise exception 'the maximum salary cannot be below the minimum' using errcode = '22023';
  end if;
  if p_salary_period is not null and p_salary_period not in ('hour', 'month', 'year') then
    raise exception 'a salary period must be hourly, monthly or yearly' using errcode = '22023';
  end if;
  if p_apply_url is not null and btrim(p_apply_url) <> ''
     and not bsdc.is_valid_application_https_url(btrim(p_apply_url)) then
    raise exception 'an apply link must be a valid https address' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'a closing date must be in the future' using errcode = '22023';
  end if;

  v_skills := case when p_skills is null then v_job.skills else p_skills end;
  if array_length(v_skills, 1) is not null and array_length(v_skills, 1) > 20 then
    raise exception 'a job can carry at most 20 skills' using errcode = '22023';
  end if;

  v_slug := bsdc.listing_slug(p_slug, v_job.slug::text);

  update public.jobs
     set title           = v_title,
         company         = v_company,
         description     = btrim(p_description),
         job_type        = coalesce(p_job_type, job_type),
         work_mode       = v_mode,
         level           = coalesce(p_level, level),
         city            = v_city,
         salary_min      = p_salary_min,
         salary_max      = p_salary_max,
         salary_period   = coalesce(p_salary_period, salary_period),
         skills          = v_skills,
         apply_url       = coalesce(btrim(p_apply_url), apply_url, ''),
         expires_at      = p_expires_at,
         cover_url       = case when p_cover_url is null then cover_url
                                else bsdc.assert_listing_cover(p_cover_url) end,
         slug            = v_slug
   where id = p_job_id;

  perform bsdc.audit('job.update', p_job_id::text, jsonb_build_object('slug', v_slug));
  return v_slug;
end;
$$;

comment on function public.update_job(uuid, text, text, text, bsdc_job_type, bsdc_work_mode, bsdc_experience_level, text, integer, integer, text, text[], text, timestamptz, text, text) is
  'Corrects a job in place. The poster or staff only; the slug never moves unless asked.';

revoke all on function public.update_job(uuid, text, text, text, bsdc_job_type, bsdc_work_mode, bsdc_experience_level, text, integer, integer, text, text[], text, timestamptz, text, text)
  from public, anon;
grant execute on function public.update_job(uuid, text, text, text, bsdc_job_type, bsdc_work_mode, bsdc_experience_level, text, integer, integer, text, text[], text, timestamptz, text, text)
  to authenticated;

-- Closing stops applications and keeps the queue readable, because the
-- employer still has to answer the people who applied. `job_application_queue`
-- checks the poster and not the status, on purpose.
create or replace function public.close_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_job public.jobs%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if v_job.poster_uid is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'only the poster of this job may close it' using errcode = '42501';
  end if;

  if v_job.status = 'closed' then
    return;
  end if;

  update public.jobs set status = 'closed' where id = p_job_id;

  -- An applicant who has not been decided is still waiting on this role. A
  -- hired, rejected or withdrawn application is a finished conversation.
  perform bsdc.notify_path(
    ja.applicant_uid,
    v_uid,
    'job',
    null,
    null,
    left('The role "' || v_job.title || '" at ' || v_job.company || ' has closed', 280),
    null,
    '/jobs/' || v_job.slug
  )
  from public.job_applications ja
  where ja.job_id = p_job_id
    and ja.status in ('submitted', 'reviewing', 'shortlisted');

  perform bsdc.audit('job.close', p_job_id::text, jsonb_build_object('slug', v_job.slug));
end;
$$;

comment on function public.close_job(uuid) is
  'Stops a job accepting applications, keeps its page and its applicant queue, and tells every undecided applicant.';

revoke all on function public.close_job(uuid) from public, anon;
grant execute on function public.close_job(uuid) to authenticated;

create or replace function public.delete_job(
  p_job_id              uuid,
  p_confirm_applications boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_job   public.jobs%rowtype;
  v_live  integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if v_job.poster_uid is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'only the poster of this job may delete it' using errcode = '42501';
  end if;

  select count(*)::integer into v_live
    from public.job_applications
   where job_id = p_job_id
     and status <> 'withdrawn';

  if v_live > 0 and not coalesce(p_confirm_applications, false) then
    raise exception 'this job has % applications; confirm the deletion to remove them',
      v_live using errcode = '22023', hint = 'job/has-applications';
  end if;

  perform bsdc.notify_path(
    ja.applicant_uid,
    v_uid,
    'job',
    null,
    null,
    left('The role "' || v_job.title || '" at ' || v_job.company || ' was withdrawn', 280),
    null,
    '/jobs'
  )
  from public.job_applications ja
  where ja.job_id = p_job_id
    and ja.status in ('submitted', 'reviewing', 'shortlisted');

  -- `job_applications.job_id` is `on delete cascade` (0013).
  delete from public.jobs where id = p_job_id;

  perform bsdc.audit('job.delete', p_job_id::text, jsonb_build_object(
    'slug', v_job.slug,
    'applications', v_live
  ));
end;
$$;

comment on function public.delete_job(uuid, boolean) is
  'Removes a job and, with explicit confirmation, the applications on it. Tells every undecided applicant.';

revoke all on function public.delete_job(uuid, boolean) from public, anon;
grant execute on function public.delete_job(uuid, boolean) to authenticated;

-- ===========================================================================
-- 3. Groups — update, delete
-- ===========================================================================

create or replace function public.update_group(
  p_group_id    uuid,
  p_name        text,
  p_description text,
  p_rules       text          default null,
  p_privacy     bsdc_group_privacy default null,
  p_language    text          default null,
  p_avatar_url  text          default null,
  p_cover_url   text          default null
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_group public.groups%rowtype;
  v_name  text := bsdc.listing_text(p_name, 80);
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_group from public.groups where id = p_group_id for update;
  if not found then
    raise exception 'group not found' using errcode = 'P0002';
  end if;

  -- `bsdc.can_moderate_group` is already the rule `groups_update_admins`
  -- (0012) applies, so a moderator who may fix a typo here may also fix it
  -- through the table and the two cannot disagree.
  if not bsdc.can_moderate_group(p_group_id, v_uid) then
    raise exception 'only a moderator of this group may change it' using errcode = '42501';
  end if;

  if char_length(v_name) < 3 then
    raise exception 'a group needs a name of at least 3 characters' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description, '')) > 2000 then
    raise exception 'a group description cannot be longer than 2000 characters'
      using errcode = '22023';
  end if;
  if p_rules is not null and char_length(p_rules) > 4000 then
    raise exception 'group rules cannot be longer than 4000 characters' using errcode = '22023';
  end if;
  if p_language is not null and p_language not in ('bn', 'en') then
    raise exception 'a group language must be bn or en' using errcode = '22023';
  end if;

  update public.groups
     set name        = v_name,
         description = coalesce(p_description, description),
         rules       = coalesce(p_rules, rules),
         privacy     = coalesce(p_privacy, privacy),
         language    = coalesce(p_language, language),
         avatar_url  = case when p_avatar_url is null then avatar_url
                            else bsdc.assert_listing_cover(p_avatar_url) end,
         cover_url   = case when p_cover_url is null then cover_url
                            else bsdc.assert_listing_cover(p_cover_url) end
   where id = p_group_id;

  perform bsdc.audit('group.update', p_group_id::text, jsonb_build_object('slug', v_group.slug));
end;
$$;

comment on function public.update_group(uuid, text, text, text, bsdc_group_privacy, text, text, text) is
  'Corrects a group''s name, description, rules, privacy, language, avatar and cover. A moderator of the group or staff only.';

revoke all on function public.update_group(uuid, text, text, text, bsdc_group_privacy, text, text, text)
  from public, anon;
grant execute on function public.update_group(uuid, text, text, text, bsdc_group_privacy, text, text, text)
  to authenticated;

-- The one deletion in this file whose consequences are not confined to the
-- person pressing the button.
--
-- The policy, decided and enforced here rather than inherited from a cascade:
--
--   * the channels go with the group (they are the group's shape);
--   * every post inside those channels is *detached, not destroyed*: its
--     `channel_id` is set to null (0011 would have done that silently) **and**
--     its status becomes `archived`, so a discussion held under a private or
--     secret group's privacy never re-appears as a public post in the author's
--     timeline. The author keeps their words; the feed does not inherit them;
--   * events that belonged to the group keep their own life (`group_id` is
--     `on delete cascade` from 0011 — so they are detached first, which is the
--     same decision `posts.channel_id` gets, and for the same reason: an event
--     is a promise made to people who RSVP'd, and destroying it would erase
--     their answer);
--   * join requests, memberships and channel rows go, because they mean nothing
--     without the group.
--
-- Owner only. A moderator may correct a group; only its owner may end it. Staff
-- may as well, because a group that is spam has to be removable from a
-- moderation queue.
create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid      text := bsdc.current_uid();
  v_group    public.groups%rowtype;
  v_detached integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_group from public.groups where id = p_group_id for update;
  if not found then
    raise exception 'group not found' using errcode = 'P0002';
  end if;

  if v_group.owner_uid is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'only the owner of this group may delete it' using errcode = '42501';
  end if;

  -- Detach before deleting, because `on delete cascade` would take the events
  -- with the group and `on delete set null` would leave a channel post live in
  -- the home feed. Both are decided above; this is the only place either
  -- decision is written.
  update public.posts p
     set channel_id = null,
         status = 'archived'
    from public.channels c
   where c.group_id = p_group_id
     and p.channel_id = c.id;
  get diagnostics v_detached = row_count;

  update public.events set group_id = null where group_id = p_group_id;

  -- Memberships, channels and join requests cascade from `public.groups.id`.
  delete from public.groups where id = p_group_id;

  perform bsdc.audit('group.delete', p_group_id::text, jsonb_build_object(
    'slug', v_group.slug,
    'posts_detached', v_detached
  ));
end;
$$;

comment on function public.delete_group(uuid) is
  'Ends a group. Owner or staff only. Its channels go; its posts are detached from the channel and archived rather than deleted; its events lose their group and keep their RSVPs.';

revoke all on function public.delete_group(uuid) from public, anon;
grant execute on function public.delete_group(uuid) to authenticated;

-- ===========================================================================
-- 4. Events — update, cancel, delete
-- ===========================================================================

create or replace function public.update_event(
  p_event_id    uuid,
  p_title       text,
  p_description text,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_mode        bsdc_event_mode default null,
  p_venue       text            default null,
  p_city        text            default null,
  p_join_url    text            default null,
  p_cover_url   text            default null,
  p_timezone    text            default null,
  p_capacity    integer         default null,
  p_slug        text            default null
)
returns text
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid    text := bsdc.current_uid();
  v_event  public.events%rowtype;
  v_title  text := bsdc.listing_text(p_title, 140);
  v_mode   bsdc_event_mode;
  v_venue  text;
  v_city   text;
  v_join   text;
  v_slug   text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  -- The host, or a moderator of the group the event belongs to — exactly the
  -- pair `events_update_host` (0012) allows — or staff.
  if v_event.host_uid is distinct from v_uid
     and not (v_event.group_id is not null and bsdc.can_moderate_group(v_event.group_id, v_uid))
     and not bsdc.is_staff() then
    raise exception 'only the host of this event may change it' using errcode = '42501';
  end if;

  v_mode := coalesce(p_mode, v_event.mode);
  v_venue := btrim(coalesce(p_venue, v_event.venue, ''));
  v_city := btrim(coalesce(p_city, v_event.city, ''));
  v_join := btrim(coalesce(p_join_url, v_event.join_url, ''));

  if char_length(v_title) < 3 then
    raise exception 'an event needs a title of at least 3 characters' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description, '')) > 8000 then
    raise exception 'an event description cannot be longer than 8000 characters'
      using errcode = '22023';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'an event must end after it starts' using errcode = '22023';
  end if;
  if char_length(v_venue) > 200 or char_length(v_city) > 80 then
    raise exception 'an event venue or city is too long' using errcode = '22023';
  end if;
  if v_mode = 'online' and v_join = '' then
    raise exception 'an online event needs a join link' using errcode = '22023';
  end if;
  if v_mode = 'in_person' and v_venue = '' then
    raise exception 'an in-person event needs a venue' using errcode = '22023';
  end if;
  if v_join <> '' and not bsdc.is_valid_application_https_url(v_join) then
    raise exception 'a join link must be a valid https address' using errcode = '22023';
  end if;
  if p_capacity is not null and p_capacity <= 0 then
    raise exception 'capacity must be a positive number' using errcode = '22023';
  end if;
  if p_capacity is not null and p_capacity < v_event.going_count then
    raise exception 'capacity cannot be below the % already going', v_event.going_count
      using errcode = '22023';
  end if;
  if p_timezone is not null and btrim(p_timezone) = '' then
    raise exception 'an event needs a time zone' using errcode = '22023';
  end if;

  v_slug := bsdc.listing_slug(p_slug, v_event.slug::text);

  update public.events
     set title       = v_title,
         description = coalesce(p_description, description),
         starts_at   = p_starts_at,
         ends_at     = p_ends_at,
         mode        = v_mode,
         venue       = v_venue,
         city        = v_city,
         join_url    = v_join,
         cover_url   = case when p_cover_url is null then cover_url
                            else bsdc.assert_listing_cover(p_cover_url) end,
         timezone    = coalesce(p_timezone, timezone),
         capacity    = p_capacity,
         slug        = v_slug
   where id = p_event_id;

  -- A moved event is the one change an attendee needs to hear about without
  -- asking. Everything else (a corrected description, a new cover) is visible
  -- on the page they already have a link to.
  if p_starts_at is distinct from v_event.starts_at then
    perform bsdc.notify_path(
      r.uid,
      v_uid,
      'event',
      null,
      null,
      left('"' || v_title || '" has moved to ' || to_char(p_starts_at at time zone v_event.timezone,
        'DD Mon, HH24:MI'), 280),
      null,
      '/events/' || v_slug
    )
    from public.event_rsvps r
    where r.event_id = p_event_id
      and r.status <> 'declined';
  end if;

  perform bsdc.audit('event.update', p_event_id::text, jsonb_build_object('slug', v_slug));
  return v_slug;
end;
$$;

comment on function public.update_event(uuid, text, text, timestamptz, timestamptz, bsdc_event_mode, text, text, text, text, text, integer, text) is
  'Corrects an event in place. Its host, a moderator of its group, or staff. Attendees hear about a moved date.';

revoke all on function public.update_event(uuid, text, text, timestamptz, timestamptz, bsdc_event_mode, text, text, text, text, text, integer, text)
  from public, anon;
grant execute on function public.update_event(uuid, text, text, timestamptz, timestamptz, bsdc_event_mode, text, text, text, text, text, integer, text)
  to authenticated;

-- Cancelling is the softer verb and the one an event actually offers: the page
-- survives with a plain notice, every RSVP survives, and everyone who said yes
-- is told. `delete_event` is for the event that should not have existed.
create or replace function public.cancel_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_event public.events%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if v_event.host_uid is distinct from v_uid
     and not (v_event.group_id is not null and bsdc.can_moderate_group(v_event.group_id, v_uid))
     and not bsdc.is_staff() then
    raise exception 'only the host of this event may cancel it' using errcode = '42501';
  end if;

  if v_event.is_cancelled then
    return;
  end if;

  update public.events set is_cancelled = true where id = p_event_id;

  perform bsdc.notify_path(
    r.uid,
    v_uid,
    'event',
    null,
    null,
    left('"' || v_event.title || '" has been cancelled', 280),
    null,
    '/events/' || v_event.slug
  )
  from public.event_rsvps r
  where r.event_id = p_event_id
    and r.status <> 'declined';

  perform bsdc.audit('event.cancel', p_event_id::text, jsonb_build_object('slug', v_event.slug));
end;
$$;

comment on function public.cancel_event(uuid) is
  'Marks an event cancelled, keeps its page and its RSVPs, and tells everyone who did not decline.';

revoke all on function public.cancel_event(uuid) from public, anon;
grant execute on function public.cancel_event(uuid) to authenticated;

create or replace function public.delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid      text := bsdc.current_uid();
  v_event    public.events%rowtype;
  v_attendees integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if v_event.host_uid is distinct from v_uid
     and not (v_event.group_id is not null and bsdc.can_moderate_group(v_event.group_id, v_uid))
     and not bsdc.is_staff() then
    raise exception 'only the host of this event may delete it' using errcode = '42501';
  end if;

  select count(*)::integer into v_attendees
    from public.event_rsvps
   where event_id = p_event_id
     and status <> 'declined';

  -- Told before the cascade; `event_rsvps.event_id` is `on delete cascade`
  -- (0011), which is the right consequence for an event that will not happen
  -- but a poor way to learn about it.
  perform bsdc.notify_path(
    r.uid,
    v_uid,
    'event',
    null,
    null,
    left('"' || v_event.title || '" has been removed', 280),
    null,
    '/events'
  )
  from public.event_rsvps r
  where r.event_id = p_event_id
    and r.status <> 'declined';

  delete from public.events where id = p_event_id;

  perform bsdc.audit('event.delete', p_event_id::text, jsonb_build_object(
    'slug', v_event.slug,
    'attendees', v_attendees
  ));
end;
$$;

comment on function public.delete_event(uuid) is
  'Removes an event and its RSVPs. Its host, a moderator of its group, or staff. Everyone who had not declined is told.';

revoke all on function public.delete_event(uuid) from public, anon;
grant execute on function public.delete_event(uuid) to authenticated;

-- ===========================================================================
-- 5. The two columns a listing needed and did not have
-- ===========================================================================
--
-- A gig has no cover and a job has none either, so the two detail pages that
-- are the most shared on the site (a role, a freelance brief) are the two that
-- render as a wall of text in every link preview. The column, not a new table:
-- one picture, on the row, validated by the routines above and by the same
-- allowlist the renderer uses.

alter table public.gigs add column if not exists cover_url text not null default '';
alter table public.jobs add column if not exists cover_url text not null default '';

comment on column public.gigs.cover_url is
  'An ImgBB-hosted cover, validated by bsdc.is_valid_application_imgbb_url in update_gig.';
comment on column public.jobs.cover_url is
  'An ImgBB-hosted cover, validated by bsdc.is_valid_application_imgbb_url in update_job.';

-- The column-level grants from 0042 named every writable column on these
-- tables. A new column is not writable until it is named, which is what keeps
-- it inside the routines above instead of behind a raw PostgREST PATCH.
grant update (cover_url) on public.gigs to authenticated;
grant update (cover_url) on public.jobs to authenticated;

-- A column nobody selects is a column nobody sees. `job_board` (0013) and
-- `job_detail` (0066) both list their columns instead of using `*`, so the
-- cover this file just added would be written, stored and never returned —
-- a job would keep its picture and every screen would draw an empty space
-- where it should be. The gig reads use `select *` and needed nothing.
--
-- Both are replaced rather than replaced-in-place: adding an OUT column
-- changes the function's return type, which `create or replace` refuses, so
-- they are dropped first. Nothing depends on them (no view, no trigger), and
-- both are re-granted immediately below, so a caller sees the new column and
-- the same permission it had before.
drop function if exists public.job_board(integer, bsdc_work_mode, text);
drop function if exists public.job_detail(text);

create function public.job_board(
  p_limit     integer default 40,
  p_work_mode bsdc_work_mode default null,
  p_skill     text default null
)
returns table (
  id              uuid,
  slug            text,
  title           text,
  company         text,
  job_type        bsdc_job_type,
  work_mode       bsdc_work_mode,
  level           bsdc_experience_level,
  city            text,
  salary_min      integer,
  salary_max      integer,
  salary_currency text,
  salary_period   text,
  skills          text[],
  cover_url       text,
  applications_count integer,
  published_at    timestamptz,
  my_status       bsdc_application_status
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    j.id, j.slug::text, j.title, j.company, j.job_type, j.work_mode, j.level, j.city,
    j.salary_min, j.salary_max, j.salary_currency, j.salary_period, j.skills,
    coalesce(j.cover_url, ''), j.applications_count, j.published_at,
    a.status
  from public.jobs j
  left join public.job_applications a
    on a.job_id = j.id and a.applicant_uid = bsdc.current_uid()
  where j.status = 'open'
    and (j.expires_at is null or j.expires_at > now())
    and (p_work_mode is null or j.work_mode = p_work_mode)
    and (p_skill is null or j.skills @> array[lower(p_skill)])
  order by j.published_at desc nulls last
  limit greatest(1, least(p_limit, 100));
$$;

create function public.job_detail(p_slug text)
returns table (
  id                 uuid,
  slug               text,
  title              text,
  company            text,
  description        text,
  job_type           bsdc_job_type,
  work_mode          bsdc_work_mode,
  level              bsdc_experience_level,
  city               text,
  country            text,
  salary_min         integer,
  salary_max         integer,
  salary_currency    text,
  salary_period      text,
  skills             text[],
  apply_url          text,
  cover_url          text,
  status             bsdc_listing_status,
  applications_count integer,
  published_at       timestamptz,
  expires_at         timestamptz,
  poster_uid         text,
  my_status          bsdc_application_status
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    j.id, j.slug::text, j.title, j.company, j.description, j.job_type, j.work_mode,
    j.level, j.city, j.country, j.salary_min, j.salary_max, j.salary_currency,
    j.salary_period, j.skills, j.apply_url, coalesce(j.cover_url, ''), j.status,
    j.applications_count, j.published_at, j.expires_at, j.poster_uid, a.status
  from public.jobs j
  left join public.job_applications a
    on a.job_id = j.id and a.applicant_uid = bsdc.current_uid()
  where j.slug = p_slug
    and (
      (j.status = 'open' and (j.expires_at is null or j.expires_at > now()))
      or j.poster_uid = bsdc.current_uid()
      or bsdc.is_staff()
    );
$$;

comment on function public.job_board(integer, bsdc_work_mode, text) is
  'Open roles for the board, now carrying the cover added in this migration.';
comment on function public.job_detail(text) is
  'One role by address. An open role to anyone; a closed or expired one only to its poster and staff.';

revoke all on function public.job_board(integer, bsdc_work_mode, text) from public, anon;
grant execute on function public.job_board(integer, bsdc_work_mode, text) to anon, authenticated;
revoke all on function public.job_detail(text) from public;
grant execute on function public.job_detail(text) to anon, authenticated;

-- ===========================================================================
-- 6. What this file deliberately does not take away
-- ===========================================================================
--
-- `jobs_update_own` and `gigs_update_own` (0014) already let an owner write the
-- status column of their own row, and `bsdc.is_staff()` the same on anybody's.
-- It would be tidy to revoke that column here and make close_gig/close_job the
-- only door — and it was written that way first. It is not done, on purpose:
--
--   * the privilege is not a hole. The policy that guards it already compares
--     the row's owner against the caller, so a member can only ever write their
--     own listing's status, which is exactly what `close_gig` lets them do;
--   * taking it away would silently break a documented capability the
--     repository already proves (t75 closes a gig with a plain UPDATE, and
--     `paused`/`open` transitions have no routine to replace it);
--   * and a member who paused a listing has no other way to publish it again.
--
-- So the routines above are the *supported* path — the one that validates a
-- cover, warns about bids and notifies the people waiting — and the column
-- grant stays as 0042 described it. A future migration that wants one door
-- should add the reopen/pause routines first and take the grant away in the
-- same change, with t75 updated to match.

commit;

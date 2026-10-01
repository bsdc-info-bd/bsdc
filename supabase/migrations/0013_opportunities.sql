-- ---------------------------------------------------------------------------
-- Opportunities: jobs, freelance gigs and project showcases.
--
-- Money is involved here, so three rules are enforced by the database rather
-- than by the interface: a salary range must be the right way round, an
-- applicant may apply to a posting exactly once, and nobody but the employer
-- and the applicant may read an application.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_job_type') then
    create type bsdc_job_type as enum ('full_time', 'part_time', 'contract', 'internship');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_work_mode') then
    create type bsdc_work_mode as enum ('onsite', 'remote', 'hybrid');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_listing_status') then
    create type bsdc_listing_status as enum ('draft', 'open', 'paused', 'closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_application_status') then
    create type bsdc_application_status as enum (
      'submitted', 'reviewing', 'shortlisted', 'rejected', 'hired', 'withdrawn'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_experience_level') then
    create type bsdc_experience_level as enum ('entry', 'junior', 'mid', 'senior', 'lead');
  end if;
end;
$$;

-- -------------------------------- jobs -------------------------------------
create table if not exists public.jobs (
  id              uuid primary key default gen_random_uuid(),
  slug            citext not null unique
                    check (slug ~ '^[a-z0-9][a-z0-9-]{2,119}$'),
  title           text not null check (char_length(btrim(title)) between 3 and 140),
  company         text not null check (char_length(btrim(company)) between 2 and 100),
  company_page_id uuid references public.pages (id) on delete set null,
  description     text not null default '' check (char_length(description) <= 20000),
  job_type        bsdc_job_type not null default 'full_time',
  work_mode       bsdc_work_mode not null default 'onsite',
  level           bsdc_experience_level not null default 'mid',
  city            text not null default '' check (char_length(city) <= 80),
  country         text not null default 'BD' check (char_length(country) = 2),
  salary_min      integer check (salary_min is null or salary_min >= 0),
  salary_max      integer check (salary_max is null or salary_max >= 0),
  salary_currency text not null default 'BDT' check (char_length(salary_currency) = 3),
  salary_period   text not null default 'month' check (salary_period in ('hour', 'month', 'year')),
  skills          text[] not null default array[]::text[],
  apply_url       text not null default '',
  status          bsdc_listing_status not null default 'open',
  poster_uid      text not null references public.profiles (uid) on delete cascade,
  applications_count integer not null default 0 check (applications_count >= 0),
  views_count     integer not null default 0 check (views_count >= 0),
  expires_at      timestamptz,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint jobs_salary_range_ordered
    check (salary_min is null or salary_max is null or salary_max >= salary_min),
  constraint jobs_remote_or_city
    check (work_mode = 'remote' or char_length(btrim(city)) >= 1),
  constraint jobs_skill_count check (array_length(skills, 1) is null or array_length(skills, 1) <= 20)
);

create index if not exists jobs_open_idx
  on public.jobs (status, published_at desc nulls last) where status = 'open';
create index if not exists jobs_poster_idx on public.jobs (poster_uid, created_at desc);
create index if not exists jobs_skills_idx on public.jobs using gin (skills);

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
  for each row execute function bsdc.touch_updated_at();

-- ------------------------------ freelance ----------------------------------
create table if not exists public.gigs (
  id            uuid primary key default gen_random_uuid(),
  slug          citext not null unique
                  check (slug ~ '^[a-z0-9][a-z0-9-]{2,119}$'),
  title         text not null check (char_length(btrim(title)) between 3 and 140),
  description   text not null default '' check (char_length(description) <= 20000),
  budget_min    integer check (budget_min is null or budget_min >= 0),
  budget_max    integer check (budget_max is null or budget_max >= 0),
  currency      text not null default 'BDT' check (char_length(currency) = 3),
  is_hourly     boolean not null default false,
  duration_days integer check (duration_days is null or duration_days between 1 and 3650),
  skills        text[] not null default array[]::text[],
  status        bsdc_listing_status not null default 'open',
  client_uid    text not null references public.profiles (uid) on delete cascade,
  proposals_count integer not null default 0 check (proposals_count >= 0),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint gigs_budget_ordered
    check (budget_min is null or budget_max is null or budget_max >= budget_min)
);

create index if not exists gigs_open_idx
  on public.gigs (status, published_at desc nulls last) where status = 'open';

drop trigger if exists gigs_touch on public.gigs;
create trigger gigs_touch before update on public.gigs
  for each row execute function bsdc.touch_updated_at();

-- --------------------- applications and proposals --------------------------
create table if not exists public.job_applications (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs (id) on delete cascade,
  applicant_uid text not null references public.profiles (uid) on delete cascade,
  cover_letter text not null default '' check (char_length(cover_letter) <= 6000),
  resume_url   text not null default '',
  status       bsdc_application_status not null default 'submitted',
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (job_id, applicant_uid)
);

create index if not exists job_applications_job_idx
  on public.job_applications (job_id, created_at desc);
create index if not exists job_applications_mine_idx
  on public.job_applications (applicant_uid, created_at desc);

create table if not exists public.gig_proposals (
  id            uuid primary key default gen_random_uuid(),
  gig_id        uuid not null references public.gigs (id) on delete cascade,
  freelancer_uid text not null references public.profiles (uid) on delete cascade,
  pitch         text not null check (char_length(btrim(pitch)) between 20 and 6000),
  bid_amount    integer not null check (bid_amount >= 0),
  delivery_days integer not null check (delivery_days between 1 and 3650),
  status        bsdc_application_status not null default 'submitted',
  created_at    timestamptz not null default now(),
  unique (gig_id, freelancer_uid)
);

create or replace function bsdc.sync_application_counts()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.jobs set applications_count = applications_count + 1 where id = new.job_id;
  elsif tg_op = 'DELETE' then
    update public.jobs
      set applications_count = greatest(applications_count - 1, 0) where id = old.job_id;
  end if;
  return null;
end;
$$;

drop trigger if exists job_applications_sync on public.job_applications;
create trigger job_applications_sync after insert or delete on public.job_applications
  for each row execute function bsdc.sync_application_counts();

create or replace function bsdc.sync_proposal_counts()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.gigs set proposals_count = proposals_count + 1 where id = new.gig_id;
  elsif tg_op = 'DELETE' then
    update public.gigs
      set proposals_count = greatest(proposals_count - 1, 0) where id = old.gig_id;
  end if;
  return null;
end;
$$;

drop trigger if exists gig_proposals_sync on public.gig_proposals;
create trigger gig_proposals_sync after insert or delete on public.gig_proposals
  for each row execute function bsdc.sync_proposal_counts();

-- ------------------------------ projects -----------------------------------
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  slug          citext not null unique
                  check (slug ~ '^[a-z0-9][a-z0-9-]{2,119}$'),
  name          text not null check (char_length(btrim(name)) between 2 and 100),
  tagline       text not null default '' check (char_length(tagline) <= 200),
  description   text not null default '' check (char_length(description) <= 20000),
  repo_url      text not null default '',
  demo_url      text not null default '',
  cover_url     text not null default '',
  tech          text[] not null default array[]::text[],
  license       text not null default '',
  looking_for_contributors boolean not null default false,
  owner_uid     text not null references public.profiles (uid) on delete cascade,
  stars_count   integer not null default 0 check (stars_count >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists projects_recent_idx on public.projects (created_at desc);
create index if not exists projects_tech_idx on public.projects using gin (tech);

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function bsdc.touch_updated_at();

create table if not exists public.project_stars (
  project_id uuid not null references public.projects (id) on delete cascade,
  uid        text not null references public.profiles (uid) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, uid)
);

create or replace function bsdc.sync_project_stars()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.projects set stars_count = stars_count + 1 where id = new.project_id;
  elsif tg_op = 'DELETE' then
    update public.projects
      set stars_count = greatest(stars_count - 1, 0) where id = old.project_id;
  end if;
  return null;
end;
$$;

drop trigger if exists project_stars_sync on public.project_stars;
create trigger project_stars_sync after insert or delete on public.project_stars
  for each row execute function bsdc.sync_project_stars();

-- ----------------------------- playground ----------------------------------
-- Saved playground programs. Execution happens in a sandboxed iframe in the
-- browser; nothing here is ever run on a server.
create table if not exists public.playground_sketches (
  id          uuid primary key default gen_random_uuid(),
  uid         text not null references public.profiles (uid) on delete cascade,
  title       text not null default 'Untitled' check (char_length(title) <= 120),
  language    text not null default 'javascript'
                check (language in ('javascript', 'typescript', 'html', 'css', 'sql')),
  code        text not null default '' check (char_length(code) <= 40000),
  is_public   boolean not null default false,
  forked_from uuid references public.playground_sketches (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists playground_mine_idx on public.playground_sketches (uid, updated_at desc);

drop trigger if exists playground_touch on public.playground_sketches;
create trigger playground_touch before update on public.playground_sketches
  for each row execute function bsdc.touch_updated_at();

-- ---------------------------------------------------------------------------
-- applying, proposing, starring
-- ---------------------------------------------------------------------------

create or replace function public.apply_to_job(
  p_job_id       uuid,
  p_cover_letter text,
  p_resume_url   text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_job public.jobs%rowtype;
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_job from public.jobs where id = p_job_id;
  if not found or v_job.status <> 'open' then
    raise exception 'this posting is not accepting applications' using errcode = 'P0002';
  end if;
  if v_job.expires_at is not null and v_job.expires_at < now() then
    raise exception 'this posting has expired' using errcode = 'P0002';
  end if;
  if v_job.poster_uid = v_uid then
    raise exception 'you cannot apply to your own posting' using errcode = '22023';
  end if;

  insert into public.job_applications (job_id, applicant_uid, cover_letter, resume_url)
    values (p_job_id, v_uid, coalesce(p_cover_letter, ''), coalesce(p_resume_url, ''))
    returning id into v_id;

  perform bsdc.notify(v_job.poster_uid, v_uid, 'moderation', null, null, 'job_application');
  return v_id;
end;
$$;

create or replace function public.withdraw_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  update public.job_applications
    set status = 'withdrawn'
    where id = p_application_id and applicant_uid = bsdc.current_uid();
end;
$$;

create or replace function public.decide_application(
  p_application_id uuid,
  p_status         bsdc_application_status
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid    text := bsdc.current_uid();
  v_app    public.job_applications%rowtype;
  v_poster text;
begin
  select * into v_app from public.job_applications where id = p_application_id;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  select poster_uid into v_poster from public.jobs where id = v_app.job_id;
  if v_poster is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'only the employer may decide an application' using errcode = '42501';
  end if;

  update public.job_applications
    set status = p_status, decided_at = now()
    where id = p_application_id;

  perform bsdc.notify(
    v_app.applicant_uid, v_uid, 'moderation', null, null, 'application_' || p_status::text
  );
end;
$$;

create or replace function public.submit_proposal(
  p_gig_id        uuid,
  p_pitch         text,
  p_bid_amount    integer,
  p_delivery_days integer
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_gig public.gigs%rowtype;
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_gig from public.gigs where id = p_gig_id;
  if not found or v_gig.status <> 'open' then
    raise exception 'this gig is not accepting proposals' using errcode = 'P0002';
  end if;
  if v_gig.client_uid = v_uid then
    raise exception 'you cannot bid on your own gig' using errcode = '22023';
  end if;

  insert into public.gig_proposals (gig_id, freelancer_uid, pitch, bid_amount, delivery_days)
    values (p_gig_id, v_uid, p_pitch, p_bid_amount, p_delivery_days)
    returning id into v_id;

  perform bsdc.notify(v_gig.client_uid, v_uid, 'moderation', null, null, 'gig_proposal');
  return v_id;
end;
$$;

create or replace function public.toggle_project_star(p_project_id uuid)
returns boolean
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
  if exists (
    select 1 from public.project_stars where project_id = p_project_id and uid = v_uid
  ) then
    delete from public.project_stars where project_id = p_project_id and uid = v_uid;
    return false;
  end if;
  insert into public.project_stars (project_id, uid) values (p_project_id, v_uid);
  return true;
end;
$$;

-- The job board in one round trip, with this member's own application state.
create or replace function public.job_board(
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
  applications_count integer,
  published_at    timestamptz,
  my_status       bsdc_application_status
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    j.id, j.slug::text, j.title, j.company, j.job_type, j.work_mode, j.level, j.city,
    j.salary_min, j.salary_max, j.salary_currency, j.salary_period, j.skills,
    j.applications_count, j.published_at,
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

create or replace function public.increment_job_view(p_job_id uuid)
returns void
language sql
security definer
set search_path = public, bsdc, pg_temp
as $$
  update public.jobs set views_count = views_count + 1 where id = p_job_id;
$$;

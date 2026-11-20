-- 0126 — a job application is a complete, private application record.
--
-- The applicant pastes links; BSDC does not upload a résumé or image. ImgBB
-- links are registered through the existing record_media_asset() RPC, and all
-- applicant fields remain ordinary Postgres columns protected by the existing
-- parties-only RLS policy. The employer queue remains the only cross-member
-- read model and checks poster/staff authority on every call.

begin;

-- Keep the SQL media classifier aligned with main-site/src/lib/media/hosts.ts
-- and ImgbbUrlAllowlist. In particular, do not accept arbitrary *.ibb.co hosts.
create or replace function bsdc.is_valid_application_https_url(p_url text)
returns boolean
language sql
immutable
parallel safe
set search_path = public, bsdc, extensions, pg_temp
as $$
  select p_url is not null
    and p_url = btrim(p_url)
    and p_url !~ '[[:space:]<>]'
    and p_url ~* '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)([.]([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?))*(:[0-9]{1,5})?([/?#][^[:space:]<>]*)?$';
$$;

create or replace function bsdc.is_valid_application_imgbb_url(p_url text)
returns boolean
language sql
immutable
parallel safe
set search_path = public, bsdc, extensions, pg_temp
as $$
  select p_url is not null
    and p_url = btrim(p_url)
    and p_url !~ '[[:space:]<>]'
    and p_url ~* '^https://(i[.]ibb[.]co|ibb[.]co|i[.]ibb[.]co[.]com|ibb[.]co[.]com|image[.]ibb[.]co|preview[.]ibb[.]co|thumb[.]ibb[.]co|i[0-9]+[.]ibb[.]co([.]com)?)(:[0-9]{1,5})?([/?#][^[:space:]<>]*)?$';
$$;

create or replace function bsdc.valid_job_application_skills(p_skills text[])
returns boolean
language sql
immutable
parallel safe
set search_path = public, bsdc, extensions, pg_temp
as $$
  select coalesce(
    cardinality(p_skills) <= 30
    and not exists (
      select 1
      from unnest(coalesce(p_skills, '{}'::text[])) as item(skill)
      where btrim(item.skill) = '' or char_length(btrim(item.skill)) > 64
    ),
    false
  );
$$;

create or replace function bsdc.valid_job_application_images(p_urls text[])
returns boolean
language sql
immutable
parallel safe
set search_path = public, bsdc, extensions, pg_temp
as $$
  select coalesce(
    cardinality(p_urls) <= 3
    and not exists (
      select 1
      from unnest(coalesce(p_urls, '{}'::text[])) as item(url)
      where not bsdc.is_valid_application_imgbb_url(item.url)
    ),
    false
  );
$$;

revoke all on function bsdc.is_valid_application_https_url(text) from public, anon, authenticated;
revoke all on function bsdc.is_valid_application_imgbb_url(text) from public, anon, authenticated;
revoke all on function bsdc.valid_job_application_skills(text[]) from public, anon, authenticated;
revoke all on function bsdc.valid_job_application_images(text[]) from public, anon, authenticated;

-- This is the same exact ImgBB host family as the application form's validator.
-- It also lets record_media_asset() record numbered iN.ibb.co.com links.
create or replace function bsdc.media_host_of(p_url text)
returns text
language sql
immutable
set search_path = public, bsdc, extensions, pg_temp
as $$
  select case
    when bsdc.is_valid_application_imgbb_url(p_url) then 'imgbb'
    else 'unknown'
  end;
$$;

alter table public.job_applications
  add column if not exists applicant_name text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists email text not null default '',
  add column if not exists location text not null default '',
  add column if not exists years_experience integer,
  add column if not exists education text not null default '',
  add column if not exists expected_salary_poisha bigint,
  add column if not exists portfolio_url text not null default '',
  add column if not exists linkedin_url text not null default '',
  add column if not exists notice_period text not null default '',
  add column if not exists skills text[] not null default '{}'::text[],
  add column if not exists certification_image_urls text[] not null default '{}'::text[],
  add column if not exists rejection_reason text not null default '';

-- Existing résumé URLs were collected without a server-side scheme check.
-- Keep only links that meet the new HTTPS contract before adding the constraint.
update public.job_applications
set resume_url = case
  when bsdc.is_valid_application_https_url(btrim(coalesce(resume_url, '')))
    then btrim(resume_url)
  else ''
end
where resume_url is null
   or resume_url <> btrim(resume_url)
   or not bsdc.is_valid_application_https_url(btrim(coalesce(resume_url, '')));

alter table public.job_applications
  drop constraint if exists job_applications_applicant_name_valid,
  drop constraint if exists job_applications_phone_valid,
  drop constraint if exists job_applications_email_valid,
  drop constraint if exists job_applications_location_valid,
  drop constraint if exists job_applications_years_experience_valid,
  drop constraint if exists job_applications_education_valid,
  drop constraint if exists job_applications_expected_salary_valid,
  drop constraint if exists job_applications_resume_url_https,
  drop constraint if exists job_applications_portfolio_url_https,
  drop constraint if exists job_applications_linkedin_url_https,
  drop constraint if exists job_applications_notice_period_valid,
  drop constraint if exists job_applications_skills_valid,
  drop constraint if exists job_applications_certification_images_valid,
  drop constraint if exists job_applications_rejection_reason_valid;

alter table public.job_applications
  add constraint job_applications_applicant_name_valid
    check (char_length(applicant_name) <= 60),
  add constraint job_applications_phone_valid
    check (char_length(phone) <= 20 and (phone = '' or (phone ~ '^[0-9+ -]+$' and phone ~ '[0-9]'))),
  add constraint job_applications_email_valid
    check (
      char_length(email) <= 320
      and (email = '' or email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$')
    ),
  add constraint job_applications_location_valid
    check (char_length(location) <= 80),
  add constraint job_applications_years_experience_valid
    check (years_experience is null or years_experience between 0 and 60),
  add constraint job_applications_education_valid
    check (char_length(education) <= 200),
  add constraint job_applications_expected_salary_valid
    check (expected_salary_poisha is null or expected_salary_poisha >= 0),
  add constraint job_applications_resume_url_https
    check (resume_url = '' or bsdc.is_valid_application_https_url(resume_url)),
  add constraint job_applications_portfolio_url_https
    check (portfolio_url = '' or bsdc.is_valid_application_https_url(portfolio_url)),
  add constraint job_applications_linkedin_url_https
    check (linkedin_url = '' or bsdc.is_valid_application_https_url(linkedin_url)),
  add constraint job_applications_notice_period_valid
    check (char_length(notice_period) <= 60),
  add constraint job_applications_skills_valid
    check (bsdc.valid_job_application_skills(skills)),
  add constraint job_applications_certification_images_valid
    check (bsdc.valid_job_application_images(certification_image_urls)),
  add constraint job_applications_rejection_reason_valid
    check (char_length(rejection_reason) <= 600);

comment on column public.job_applications.applicant_name is
  'The applicant name they chose for this application; blank legacy values fall back to profiles.display_name.';
comment on column public.job_applications.phone is
  'Private contact phone, visible only to the applicant and the job poster/staff through authorized reads.';
comment on column public.job_applications.email is
  'Private application contact email, explicitly supplied or populated from the signed-in identity only when profiles.privacy.showEmail is true.';
comment on column public.job_applications.certification_image_urls is
  'At most three HTTPS ImgBB public links; no file upload or storage bucket.';
comment on column public.job_applications.rejection_reason is
  'Private decision note shown to the applicant when their application is rejected.';

-- Change the apply RPC signature deliberately. PostgreSQL would keep the old
-- 3-argument function as an overload if it were only CREATE OR REPLACE'd.
drop function if exists public.apply_to_job(uuid, text, text);

create function public.apply_to_job(
  p_job_id                  uuid,
  p_cover_letter            text,
  p_resume_url              text default '',
  p_applicant_name          text default '',
  p_phone                   text default '',
  p_email                   text default '',
  p_location                text default '',
  p_years_experience        integer default null,
  p_education               text default '',
  p_expected_salary_poisha  bigint default null,
  p_portfolio_url           text default '',
  p_linkedin_url            text default '',
  p_notice_period           text default '',
  p_skills                  text[] default '{}'::text[],
  p_certification_image_urls text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_job public.jobs%rowtype;
  v_profile public.profiles%rowtype;
  v_id uuid;
  v_cover_letter text := btrim(coalesce(p_cover_letter, ''));
  v_applicant_name text := left(btrim(coalesce(p_applicant_name, '')), 60);
  v_phone text := btrim(coalesce(p_phone, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token_email text := lower(btrim(coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''
  )));
  v_location text := btrim(coalesce(p_location, ''));
  v_education text := btrim(coalesce(p_education, ''));
  v_resume_url text := btrim(coalesce(p_resume_url, ''));
  v_portfolio_url text := btrim(coalesce(p_portfolio_url, ''));
  v_linkedin_url text := btrim(coalesce(p_linkedin_url, ''));
  v_notice_period text := btrim(coalesce(p_notice_period, ''));
  v_skills text[] := coalesce(p_skills, '{}'::text[]);
  v_images text[] := coalesce(p_certification_image_urls, '{}'::text[]);
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

  if char_length(v_cover_letter) < 20 or char_length(v_cover_letter) > 6000 then
    raise exception 'cover letter must be between 20 and 6000 characters' using errcode = '22023';
  end if;
  if char_length(v_applicant_name) > 60 then
    raise exception 'applicant name is too long' using errcode = '22023';
  end if;
  if char_length(v_phone) > 20 or (v_phone <> '' and (v_phone !~ '^[0-9+ -]+$' or v_phone !~ '[0-9]')) then
    raise exception 'phone number is invalid' using errcode = '22023';
  end if;
  if char_length(v_email) > 320 or (v_email <> '' and v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$') then
    raise exception 'email address is invalid' using errcode = '22023';
  end if;
  if char_length(v_location) > 80 then
    raise exception 'location is too long' using errcode = '22023';
  end if;
  if p_years_experience is not null and p_years_experience not between 0 and 60 then
    raise exception 'years of experience must be between 0 and 60' using errcode = '22023';
  end if;
  if char_length(v_education) > 200 then
    raise exception 'education is too long' using errcode = '22023';
  end if;
  if p_expected_salary_poisha is not null and p_expected_salary_poisha < 0 then
    raise exception 'expected salary cannot be negative' using errcode = '22023';
  end if;
  if (v_resume_url <> '' and not bsdc.is_valid_application_https_url(v_resume_url))
     or (v_portfolio_url <> '' and not bsdc.is_valid_application_https_url(v_portfolio_url))
     or (v_linkedin_url <> '' and not bsdc.is_valid_application_https_url(v_linkedin_url)) then
    raise exception 'application links must be valid https URLs' using errcode = '22023';
  end if;
  if char_length(v_notice_period) > 60 then
    raise exception 'notice period is too long' using errcode = '22023';
  end if;
  if not bsdc.valid_job_application_skills(v_skills) then
    raise exception 'application skills are invalid' using errcode = '22023';
  end if;
  if not bsdc.valid_job_application_images(v_images) then
    raise exception 'certification images must be ImgBB HTTPS links (up to three)' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where uid = v_uid;
  if v_email = ''
     and coalesce(v_profile.privacy ->> 'showEmail', 'false') = 'true'
     and v_token_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$' then
    v_email := v_token_email;
  end if;
  if v_phone = '' and v_email = '' then
    raise exception 'provide a phone number or contact email' using errcode = '22023';
  end if;
  if v_applicant_name = '' then
    v_applicant_name := left(coalesce(nullif(btrim(v_profile.display_name), ''), 'Member'), 60);
  end if;

  insert into public.job_applications (
    job_id, applicant_uid, applicant_name, cover_letter, resume_url,
    phone, email, location, years_experience, education, expected_salary_poisha,
    portfolio_url, linkedin_url, notice_period, skills, certification_image_urls
  ) values (
    p_job_id, v_uid, v_applicant_name, v_cover_letter, v_resume_url,
    v_phone, v_email, v_location, p_years_experience, v_education, p_expected_salary_poisha,
    v_portfolio_url, v_linkedin_url, v_notice_period, v_skills, v_images
  )
  on conflict (job_id, applicant_uid) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'job/already-applied' using errcode = '23505';
  end if;

  perform bsdc.notify_path(
    v_job.poster_uid, v_uid, 'job', null, null,
    left('New application for ' || v_job.title, 280), null,
    '/jobs/' || v_job.slug
  );
  return v_id;
end;
$$;

revoke all on function public.apply_to_job(
  uuid, text, text, text, text, text, text, integer, text, bigint,
  text, text, text, text[], text[]
) from public, anon;
grant execute on function public.apply_to_job(
  uuid, text, text, text, text, text, text, integer, text, bigint,
  text, text, text, text[], text[]
) to authenticated;

-- The return table grows. DROP first: PostgreSQL cannot CREATE OR REPLACE a
-- table-returning function with a changed output row type.
drop function if exists public.job_application_queue(uuid, integer);

create function public.job_application_queue(
  p_job_id uuid,
  p_limit integer default 100
)
returns table (
  id uuid,
  job_id uuid,
  applicant_uid text,
  applicant_name text,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  phone text,
  email text,
  location text,
  years_experience integer,
  education text,
  expected_salary_poisha bigint,
  portfolio_url text,
  linkedin_url text,
  notice_period text,
  skills text[],
  certification_image_urls text[],
  cover_letter text,
  resume_url text,
  status bsdc_application_status,
  rejection_reason text,
  decided_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_job public.jobs%rowtype;
  v_cap integer := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_job_id is null then
    raise exception 'job id required' using errcode = '22023';
  end if;

  select j.* into v_job from public.jobs j where j.id = p_job_id;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if v_job.poster_uid is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'only the poster of this job may read its applications'
      using errcode = '42501';
  end if;

  -- `profiles` contains `email_verified` and `privacy`, but no email address.
  -- The explicitly supplied application email is shown to the employer; there
  -- is no profile email column to use as a privacy-controlled fallback.
  return query
    select
      ja.id,
      ja.job_id,
      ja.applicant_uid,
      ja.applicant_name,
      coalesce(p.username::text, ''),
      coalesce(nullif(btrim(ja.applicant_name), ''), nullif(btrim(p.display_name), ''), 'Member'),
      coalesce(p.avatar_url, ''),
      (p.role in ('moderator', 'manager', 'admin', 'owner')),
      ja.phone,
      ja.email,
      ja.location,
      ja.years_experience,
      ja.education,
      ja.expected_salary_poisha,
      ja.portfolio_url,
      ja.linkedin_url,
      ja.notice_period,
      ja.skills,
      ja.certification_image_urls,
      ja.cover_letter,
      ja.resume_url,
      ja.status,
      ja.rejection_reason,
      ja.decided_at,
      ja.created_at
    from public.job_applications ja
    left join public.profiles p on p.uid = ja.applicant_uid
    where ja.job_id = p_job_id
    order by
      (ja.status in ('rejected', 'withdrawn', 'hired')) asc,
      ja.created_at desc
    limit v_cap;
end;
$$;

comment on function public.job_application_queue(uuid, integer) is
  'Private application review queue with complete applicant-supplied details. Job poster or staff only; never a public application read.';
revoke all on function public.job_application_queue(uuid, integer) from public, anon;
grant execute on function public.job_application_queue(uuid, integer) to authenticated;

-- An applicant's own tracker is a separate, contact-free read model.
create or replace function public.my_job_applications(p_limit integer default 40)
returns table (
  id uuid,
  job_id uuid,
  job_slug text,
  job_title text,
  company text,
  job_status bsdc_listing_status,
  expires_at timestamptz,
  applicant_name text,
  cover_letter text,
  resume_url text,
  portfolio_url text,
  linkedin_url text,
  location text,
  years_experience integer,
  education text,
  expected_salary_poisha bigint,
  notice_period text,
  skills text[],
  certification_image_urls text[],
  status bsdc_application_status,
  rejection_reason text,
  decided_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_cap integer := least(greatest(coalesce(p_limit, 40), 1), 100);
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
    select
      ja.id, ja.job_id, j.slug::text, j.title, j.company, j.status, j.expires_at,
      ja.applicant_name, ja.cover_letter, ja.resume_url, ja.portfolio_url, ja.linkedin_url,
      ja.location, ja.years_experience, ja.education, ja.expected_salary_poisha,
      ja.notice_period, ja.skills, ja.certification_image_urls,
      ja.status, ja.rejection_reason, ja.decided_at, ja.created_at
    from public.job_applications ja
    join public.jobs j on j.id = ja.job_id
    where ja.applicant_uid = v_uid
    order by ja.created_at desc
    limit v_cap;
end;
$$;

revoke all on function public.my_job_applications(integer) from public, anon;
grant execute on function public.my_job_applications(integer) to authenticated;

-- Store the decline note on the same application and send it through the
-- existing notification path. The employer write remains this single RPC.
drop function if exists public.decide_application(uuid, bsdc_application_status);

create function public.decide_application(
  p_application_id uuid,
  p_status bsdc_application_status,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_app public.job_applications%rowtype;
  v_poster text;
  v_title text;
  v_slug text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select ja.* into v_app from public.job_applications ja where ja.id = p_application_id;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  select poster_uid, title, slug into v_poster, v_title, v_slug
    from public.jobs where id = v_app.job_id;
  if v_poster is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'only the employer may decide an application' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('reviewing', 'shortlisted', 'hired', 'rejected') then
    raise exception 'invalid employer decision' using errcode = '22023';
  end if;
  if p_status = 'rejected' and char_length(v_reason) < 3 then
    raise exception 'a rejection reason of at least three characters is required' using errcode = '22023';
  end if;
  if char_length(v_reason) > 600 then
    raise exception 'decision note is too long' using errcode = '22023';
  end if;

  update public.job_applications
    set status = p_status,
        rejection_reason = case when p_status = 'rejected' then v_reason else '' end,
        decided_at = now()
    where public.job_applications.id = p_application_id;

  perform bsdc.notify_path(
    v_app.applicant_uid, v_uid, 'job', null, null,
    left(
      'Application ' || p_status::text || ': ' || coalesce(v_title, 'job')
      || case when p_status = 'rejected' then ' — ' || v_reason else '' end,
      280
    ),
    null,
    case when coalesce(v_slug, '') <> '' then '/jobs/' || v_slug else '/jobs' end
  );
end;
$$;

revoke all on function public.decide_application(uuid, bsdc_application_status, text) from public, anon;
grant execute on function public.decide_application(uuid, bsdc_application_status, text) to authenticated;

commit;

-- 0113 — an employer's application queue, read in one call.
--
-- `job_applications` has always been readable by the job's poster through
-- `job_applications_read_parties` (0014), but the queue a screen needs is not
-- the table: it is the application plus the applicant's public card, and
-- `profiles` has no `verified` column — verification is derived from `role` in
-- every read RPC (0092). Android asked PostgREST for `verified` on an embedded
-- `profiles` select and got a 400, which is why an employer with applicants saw
-- an empty queue.
--
-- This is the same shape as `gig_proposal_queue()` (0112), deliberately: two
-- queues that answer the same question should not answer it differently.

create or replace function public.job_application_queue(
  p_job_id uuid,
  p_limit  integer default 100
)
returns table (
  id             uuid,
  job_id         uuid,
  applicant_uid  text,
  username       text,
  display_name   text,
  avatar_url     text,
  verified       boolean,
  cover_letter   text,
  resume_url     text,
  status         bsdc_application_status,
  decided_at     timestamptz,
  created_at     timestamptz
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

  select * into v_job from public.jobs where id = p_job_id;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  -- The poster, or staff. `jobs.poster_uid` is the column `decide_application`
  -- already checks, so the read and the write agree about who the employer is.
  if v_job.poster_uid is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'only the poster of this job may read its applications'
      using errcode = '42501';
  end if;

  return query
    select
      ja.id,
      ja.job_id,
      ja.applicant_uid,
      coalesce(p.username, '')                              as username,
      coalesce(nullif(btrim(p.display_name), ''), 'Member') as display_name,
      coalesce(p.avatar_url, '')                            as avatar_url,
      (p.role in ('moderator', 'manager', 'admin', 'owner')) as verified,
      ja.cover_letter,
      ja.resume_url,
      ja.status,
      ja.decided_at,
      ja.created_at
    from public.job_applications ja
    left join public.profiles p on p.uid = ja.applicant_uid
    where ja.job_id = p_job_id
    order by
      -- Undecided applications are the work; decided ones are the record.
      (ja.status in ('rejected', 'withdrawn', 'hired')) asc,
      ja.created_at desc
    limit v_cap;
end;
$$;

comment on function public.job_application_queue(uuid, integer) is
  'Every application on one job, with the applicant public card and a derived verified flag. Poster of the job or staff only.';

revoke all on function public.job_application_queue(uuid, integer) from public;
grant execute on function public.job_application_queue(uuid, integer) to authenticated;

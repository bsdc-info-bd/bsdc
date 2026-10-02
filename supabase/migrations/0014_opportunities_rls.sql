-- ---------------------------------------------------------------------------
-- Row level security for jobs, gigs, projects and the playground.
--
-- Listings are public once open. An application is private between the
-- applicant and the employer — not even other applicants can count them.
-- ---------------------------------------------------------------------------

alter table public.jobs                 enable row level security;
alter table public.gigs                 enable row level security;
alter table public.job_applications     enable row level security;
alter table public.gig_proposals        enable row level security;
alter table public.projects             enable row level security;
alter table public.project_stars        enable row level security;
alter table public.playground_sketches  enable row level security;

-- -------------------------------- jobs -------------------------------------
drop policy if exists jobs_read_open on public.jobs;
create policy jobs_read_open on public.jobs
  for select using (
    (status = 'open' and (expires_at is null or expires_at > now()))
    or poster_uid = bsdc.current_uid()
    or bsdc.is_staff()
  );

drop policy if exists jobs_insert_self on public.jobs;
create policy jobs_insert_self on public.jobs
  for insert with check (poster_uid = bsdc.current_uid());

drop policy if exists jobs_update_own on public.jobs;
create policy jobs_update_own on public.jobs
  for update using (poster_uid = bsdc.current_uid() or bsdc.is_staff())
  with check (poster_uid = bsdc.current_uid() or bsdc.is_staff());

drop policy if exists jobs_delete_own on public.jobs;
create policy jobs_delete_own on public.jobs
  for delete using (poster_uid = bsdc.current_uid() or bsdc.is_staff());

-- -------------------------------- gigs -------------------------------------
drop policy if exists gigs_read_open on public.gigs;
create policy gigs_read_open on public.gigs
  for select using (
    status = 'open' or client_uid = bsdc.current_uid() or bsdc.is_staff()
  );

drop policy if exists gigs_insert_self on public.gigs;
create policy gigs_insert_self on public.gigs
  for insert with check (client_uid = bsdc.current_uid());

drop policy if exists gigs_update_own on public.gigs;
create policy gigs_update_own on public.gigs
  for update using (client_uid = bsdc.current_uid() or bsdc.is_staff())
  with check (client_uid = bsdc.current_uid() or bsdc.is_staff());

drop policy if exists gigs_delete_own on public.gigs;
create policy gigs_delete_own on public.gigs
  for delete using (client_uid = bsdc.current_uid() or bsdc.is_staff());

-- --------------------------- job_applications ------------------------------
drop policy if exists job_applications_read_parties on public.job_applications;
create policy job_applications_read_parties on public.job_applications
  for select using (
    applicant_uid = bsdc.current_uid()
    or exists (
      select 1 from public.jobs j
      where j.id = job_id and j.poster_uid = bsdc.current_uid()
    )
    or bsdc.is_staff()
  );

-- Applying goes through public.apply_to_job(); an applicant may only retract.
drop policy if exists job_applications_delete_own on public.job_applications;
create policy job_applications_delete_own on public.job_applications
  for delete using (applicant_uid = bsdc.current_uid());

-- ----------------------------- gig_proposals -------------------------------
drop policy if exists gig_proposals_read_parties on public.gig_proposals;
create policy gig_proposals_read_parties on public.gig_proposals
  for select using (
    freelancer_uid = bsdc.current_uid()
    or exists (
      select 1 from public.gigs g
      where g.id = gig_id and g.client_uid = bsdc.current_uid()
    )
    or bsdc.is_staff()
  );

drop policy if exists gig_proposals_delete_own on public.gig_proposals;
create policy gig_proposals_delete_own on public.gig_proposals
  for delete using (freelancer_uid = bsdc.current_uid());

-- ------------------------------- projects ----------------------------------
drop policy if exists projects_read_all on public.projects;
create policy projects_read_all on public.projects for select using (true);

drop policy if exists projects_insert_self on public.projects;
create policy projects_insert_self on public.projects
  for insert with check (owner_uid = bsdc.current_uid());

drop policy if exists projects_update_own on public.projects;
create policy projects_update_own on public.projects
  for update using (owner_uid = bsdc.current_uid() or bsdc.is_staff())
  with check (owner_uid = bsdc.current_uid() or bsdc.is_staff());

drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own on public.projects
  for delete using (owner_uid = bsdc.current_uid() or bsdc.is_staff());

drop policy if exists project_stars_read on public.project_stars;
create policy project_stars_read on public.project_stars for select using (true);

drop policy if exists project_stars_write_self on public.project_stars;
create policy project_stars_write_self on public.project_stars
  for all using (uid = bsdc.current_uid()) with check (uid = bsdc.current_uid());

-- ------------------------------ playground ---------------------------------
drop policy if exists playground_read on public.playground_sketches;
create policy playground_read on public.playground_sketches
  for select using (is_public or uid = bsdc.current_uid());

drop policy if exists playground_write_self on public.playground_sketches;
create policy playground_write_self on public.playground_sketches
  for all using (uid = bsdc.current_uid()) with check (uid = bsdc.current_uid());

-- ------------------------------- grants ------------------------------------
grant select on public.jobs to anon, authenticated;
grant insert, update, delete on public.jobs to authenticated;
grant select on public.gigs to anon, authenticated;
grant insert, update, delete on public.gigs to authenticated;
grant select, delete on public.job_applications to authenticated;
grant select, delete on public.gig_proposals to authenticated;
grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;
grant select on public.project_stars to anon, authenticated;
grant insert, delete on public.project_stars to authenticated;
grant select, insert, update, delete on public.playground_sketches to authenticated;

-- Counters are server-owned.
revoke update (applications_count, views_count) on public.jobs from authenticated;
revoke update (proposals_count) on public.gigs from authenticated;
revoke update (stars_count) on public.projects from authenticated;

grant execute on function public.apply_to_job(uuid, text, text) to authenticated;
grant execute on function public.withdraw_application(uuid) to authenticated;
grant execute on function public.decide_application(uuid, bsdc_application_status)
  to authenticated;
grant execute on function public.submit_proposal(uuid, text, integer, integer) to authenticated;
grant execute on function public.toggle_project_star(uuid) to authenticated;
grant execute on function public.job_board(integer, bsdc_work_mode, text)
  to anon, authenticated;
grant execute on function public.increment_job_view(uuid) to anon, authenticated;

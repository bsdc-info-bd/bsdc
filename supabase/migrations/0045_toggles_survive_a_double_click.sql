-- ---------------------------------------------------------------------------
-- A double click is not an error.
--
-- Eight functions toggle state by reading first and writing second:
--
--   public.toggle_reaction          post_reactions     (post_id, uid)
--   public.toggle_comment_reaction  comment_reactions  (comment_id, uid)
--   public.toggle_bookmark          bookmarks          (uid, post_id)
--   public.toggle_page_follow       page_followers     (page_id, uid)
--   public.toggle_project_star      project_stars      (project_id, uid)
--   public.toggle_wishlist          wishlist_items     (uid, product_id)
--   public.apply_to_job             job_applications   unique (job_id, applicant_uid)
--   public.submit_proposal          gig_proposals      unique (gig_id, freelancer_uid)
--
-- Each one does `if exists(…) then delete else insert`. Two requests that
-- arrive together — the ordinary case for a tapped like button, or a form
-- submitted twice on a slow connection — both read "not there", both insert,
-- and the second gets
--
--   23505 duplicate key value violates unique constraint "post_reactions_pkey"
--
-- which the member sees as "That value is already in use." on a like button,
-- or as a raw failure when re-submitting a job application they have already
-- sent. The row is right; the error is not, and `apply_to_job` has no way to
-- say "you already applied" because the constraint speaks first.
--
-- The fix is to let the database resolve the collision instead of racing it:
-- the plain INSERT becomes `insert … on conflict … do update` (toggles, where
-- the loser's intent is satisfied by the winner's row) or `do nothing` plus an
-- explicit domain error (the two submissions, where a duplicate is a mistake
-- worth naming). No counter is affected: the counter triggers fire on INSERT
-- and DELETE only, so a conflict-resolved UPDATE to the same value does not
-- double-count, and a lost DELETE (0 rows) fires nothing.
--
-- The trigger bodies this relies on are the security-definer versions from
-- 0039, so the conflict path runs as the owner just like the insert path.
--
-- Creating a function twice is a no-op, so this file is safe to re-run.
-- ---------------------------------------------------------------------------

-- ------------------------------ reactions ----------------------------------

create or replace function public.toggle_reaction(p_post_id uuid, p_reaction bsdc_reaction)
returns table (reacted boolean, reaction bsdc_reaction, total integer)
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid      text := bsdc.current_uid();
  v_existing bsdc_reaction;
  v_total    integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and p.status = 'published'
      and bsdc.can_read_post(p.author_uid, p.status, p.visibility)
  ) then
    raise exception 'post not available' using errcode = 'P0002';
  end if;

  select pr.reaction into v_existing
    from public.post_reactions pr
    where pr.post_id = p_post_id and pr.uid = v_uid;

  if v_existing is not null and v_existing = p_reaction then
    -- The same reaction again means "take it back".
    delete from public.post_reactions pr
      where pr.post_id = p_post_id and pr.uid = v_uid;
    select p.likes_count into v_total from public.posts p where p.id = p_post_id;
    return query select false, p_reaction, v_total;
  else
    -- Either the first reaction or a change of mind, in one statement that
    -- two concurrent requests cannot turn into a duplicate-key failure.
    insert into public.post_reactions (post_id, uid, reaction)
      values (p_post_id, v_uid, p_reaction)
      on conflict (post_id, uid)
      do update set reaction = excluded.reaction, created_at = now();
    select p.likes_count into v_total from public.posts p where p.id = p_post_id;
    return query select true, p_reaction, v_total;
  end if;
end;
$$;

create or replace function public.toggle_comment_reaction(p_comment_id uuid)
returns table (reacted boolean, total integer)
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_total integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.comment_reactions cr
    where cr.comment_id = p_comment_id and cr.uid = v_uid
  ) then
    delete from public.comment_reactions cr
      where cr.comment_id = p_comment_id and cr.uid = v_uid;
    select c.likes_count into v_total from public.comments c where c.id = p_comment_id;
    return query select false, v_total;
  else
    insert into public.comment_reactions (comment_id, uid)
      values (p_comment_id, v_uid)
      on conflict (comment_id, uid) do nothing;
    select c.likes_count into v_total from public.comments c where c.id = p_comment_id;
    return query select true, v_total;
  end if;
end;
$$;

create or replace function public.toggle_bookmark(p_post_id uuid, p_collection_id uuid default null)
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

  if exists (select 1 from public.bookmarks b where b.uid = v_uid and b.post_id = p_post_id) then
    delete from public.bookmarks b where b.uid = v_uid and b.post_id = p_post_id;
    return false;
  end if;

  insert into public.bookmarks (uid, post_id, collection_id)
    values (v_uid, p_post_id, p_collection_id)
    on conflict (uid, post_id) do nothing;
  return true;
end;
$$;

-- ------------------------------ communities --------------------------------

create or replace function public.toggle_page_follow(p_page_id uuid)
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
  if exists (select 1 from public.page_followers where page_id = p_page_id and uid = v_uid) then
    delete from public.page_followers where page_id = p_page_id and uid = v_uid;
    return false;
  end if;
  insert into public.page_followers (page_id, uid)
    values (p_page_id, v_uid)
    on conflict (page_id, uid) do nothing;
  return true;
end;
$$;

-- ----------------------------- opportunities -------------------------------

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
  insert into public.project_stars (project_id, uid)
    values (p_project_id, v_uid)
    on conflict (project_id, uid) do nothing;
  return true;
end;
$$;

-- A second application is not a database error, it is a member telling us
-- something they have already told us. The conflict is resolved silently and
-- the answer is a named, translatable failure instead of a constraint name.
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
    on conflict (job_id, applicant_uid) do nothing
    returning id into v_id;

  if v_id is null then
    raise exception 'job/already-applied' using errcode = '23505';
  end if;

  perform bsdc.notify(v_job.poster_uid, v_uid, 'moderation', null, null, 'job_application');
  return v_id;
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
    on conflict (gig_id, freelancer_uid) do nothing
    returning id into v_id;

  if v_id is null then
    raise exception 'gig/already-proposed' using errcode = '23505';
  end if;

  perform bsdc.notify(v_gig.client_uid, v_uid, 'moderation', null, null, 'gig_proposal');
  return v_id;
end;
$$;

-- ------------------------------ marketplace --------------------------------

create or replace function public.toggle_wishlist(p_product_id uuid)
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
    select 1 from public.wishlist_items where uid = v_uid and product_id = p_product_id
  ) then
    delete from public.wishlist_items where uid = v_uid and product_id = p_product_id;
    return false;
  end if;
  insert into public.wishlist_items (uid, product_id)
    values (v_uid, p_product_id)
    on conflict (uid, product_id) do nothing;
  return true;
end;
$$;

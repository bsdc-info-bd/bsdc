-- ---------------------------------------------------------------------------
-- The counter triggers must run as the table owner, not as the member.
--
-- Every denormalised counter on the platform is maintained by an AFTER
-- trigger: publishing a post moves `profiles.posts_count`, attaching a tag
-- moves `tags.posts_count`, following moves the two counters on `profiles`,
-- reacting moves `posts.likes_count`, commenting moves `posts.comments_count`,
-- and so on for pages, events, jobs, gigs, projects and conversations.
--
-- Those counters are deliberately *not* writable by a member: 0002, 0004 and
-- the corporate RLS files grant a column list that excludes them, which is the
-- whole reason the browser cannot inflate its own numbers. A trigger function
-- without SECURITY DEFINER, however, runs with the privileges of whoever fired
-- the statement — so a member inserting their own post executed
--
--   update public.profiles set posts_count = posts_count + 1 ...
--
-- as `authenticated`, which holds no UPDATE privilege on that column at all.
-- Postgres refuses the inner statement with 42501 and the refusal aborts the
-- whole outer statement, so the symptom was a member being told
--
--   "Could not save that: you do not have permission to do that"
--
-- while trying to publish an ordinary post, a poll or a draft they then
-- published. Reading the policy text never shows this: only firing the trigger
-- as the member does. `scripts/rls-proof.sql` now does exactly that so this
-- class of fault cannot come back quietly.
--
-- The fix follows the shape already used by 0005 (`bump_author_affinity`) and
-- 0015 (`sync_course_totals`, `sync_enrolled_count`, `sync_enrollment_progress`)
-- and by 0018's `sync_review_totals`: the counter maintainer runs as the owner
-- with a pinned search path. The clamp (`greatest(..., 0)`) is unchanged, no
-- counter can be reached by a browser, and the trigger bodies are otherwise
-- byte for byte the ones they replace.
--
-- `bsdc.record_post_revision` is here for the same reason: it writes a row into
-- `public.post_revisions`, a table with no member INSERT grant and no INSERT
-- policy, so editing a published post failed at the revision copy rather than
-- at the update itself.
--
-- Creating a function twice is a no-op, so this file is safe to re-run.
-- ---------------------------------------------------------------------------

-- --------------------------- follows ---------------------------------------
create or replace function bsdc.sync_follow_counts()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1
      where uid = new.follower_uid;
    update public.profiles set followers_count = followers_count + 1
      where uid = new.followee_uid;
  elsif tg_op = 'DELETE' then
    update public.profiles set following_count = greatest(following_count - 1, 0)
      where uid = old.follower_uid;
    update public.profiles set followers_count = greatest(followers_count - 1, 0)
      where uid = old.followee_uid;
  end if;
  return null;
end;
$$;

-- --------------------------- content ---------------------------------------
create or replace function bsdc.sync_post_counts()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if tg_op = 'INSERT' and new.status = 'published' then
    update public.profiles set posts_count = posts_count + 1 where uid = new.author_uid;
  elsif tg_op = 'UPDATE' and old.status <> 'published' and new.status = 'published' then
    update public.profiles set posts_count = posts_count + 1 where uid = new.author_uid;
  elsif tg_op = 'UPDATE' and old.status = 'published' and new.status <> 'published' then
    update public.profiles set posts_count = greatest(posts_count - 1, 0) where uid = new.author_uid;
  elsif tg_op = 'DELETE' and old.status = 'published' then
    update public.profiles set posts_count = greatest(posts_count - 1, 0) where uid = old.author_uid;
  end if;
  return null;
end;
$$;

create or replace function bsdc.sync_tag_counts()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.tags set posts_count = posts_count + 1 where slug = new.tag_slug;
  elsif tg_op = 'DELETE' then
    update public.tags set posts_count = greatest(posts_count - 1, 0) where slug = old.tag_slug;
  end if;
  return null;
end;
$$;

create or replace function bsdc.sync_poll_votes()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.poll_options set votes = votes + 1 where id = new.option_id;
  elsif tg_op = 'DELETE' then
    update public.poll_options set votes = greatest(votes - 1, 0) where id = old.option_id;
  end if;
  return null;
end;
$$;

-- One row per edit of a published post. Append-only history: no member INSERT
-- grant and no INSERT policy, so this function has to run as the owner.
create or replace function bsdc.record_post_revision()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if old.status = 'published' and (old.title is distinct from new.title
      or old.body is distinct from new.body) then
    insert into public.post_revisions (post_id, editor_uid, title, body)
    values (old.id, coalesce(bsdc.current_uid(), old.author_uid), old.title, old.body);
    new.edited_at = now();
  end if;
  return new;
end;
$$;

-- --------------------------- interactions ----------------------------------
create or replace function bsdc.sync_reaction_counts()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_author text;
begin
  if tg_op = 'INSERT' then
    update public.posts
      set likes_count = likes_count + 1
      where id = new.post_id
      returning author_uid into v_author;
    perform bsdc.notify(v_author, new.uid, 'reaction', new.post_id, null, new.reaction::text);
  elsif tg_op = 'DELETE' then
    update public.posts
      set likes_count = greatest(likes_count - 1, 0)
      where id = old.post_id;
  end if;
  return null;
end;
$$;

create or replace function bsdc.sync_comment_counts()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_author text;
  v_parent_author text;
begin
  if tg_op = 'INSERT' then
    update public.posts
      set comments_count = comments_count + 1
      where id = new.post_id
      returning author_uid into v_author;
    if new.parent_id is not null then
      update public.comments
        set replies_count = replies_count + 1
        where id = new.parent_id
        returning author_uid into v_parent_author;
      perform bsdc.notify(
        v_parent_author, new.author_uid, 'reply', new.post_id, new.id, left(new.body, 280)
      );
    end if;
    perform bsdc.notify(
      v_author, new.author_uid, 'comment', new.post_id, new.id, left(new.body, 280)
    );
  elsif tg_op = 'DELETE' then
    update public.posts
      set comments_count = greatest(comments_count - 1, 0)
      where id = old.post_id;
    if old.parent_id is not null then
      update public.comments
        set replies_count = greatest(replies_count - 1, 0)
        where id = old.parent_id;
    end if;
  end if;
  return null;
end;
$$;

create or replace function bsdc.sync_comment_reaction_counts()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_author text;
  v_post   uuid;
begin
  if tg_op = 'INSERT' then
    update public.comments
      set likes_count = likes_count + 1
      where id = new.comment_id
      returning author_uid, post_id into v_author, v_post;
    perform bsdc.notify(v_author, new.uid, 'reaction', v_post, new.comment_id, 'like');
  elsif tg_op = 'DELETE' then
    update public.comments
      set likes_count = greatest(likes_count - 1, 0)
      where id = old.comment_id;
  end if;
  return null;
end;
$$;

-- --------------------------- messaging -------------------------------------
create or replace function bsdc.sync_conversation_activity()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_preview text;
begin
  v_preview := case new.kind
    when 'text' then left(new.body, 160)
    when 'image' then 'image'
    when 'file' then coalesce(nullif(left(new.media_name, 160), ''), 'file')
    when 'snippet' then 'snippet'
    else left(new.body, 160)
  end;

  update public.conversations
    set last_message_at = new.created_at,
        last_message_preview = v_preview
    where id = new.conversation_id;

  -- The sender has by definition read their own message.
  update public.conversation_members
    set last_read_at = greatest(last_read_at, new.created_at)
    where conversation_id = new.conversation_id and uid = new.sender_uid;

  return null;
end;
$$;

-- --------------------------- communities -----------------------------------
create or replace function bsdc.sync_group_member_counts()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.groups set members_count = members_count + 1 where id = new.group_id;
  elsif tg_op = 'DELETE' then
    update public.groups
      set members_count = greatest(members_count - 1, 0)
      where id = old.group_id;
  end if;
  return null;
end;
$$;

create or replace function bsdc.sync_page_follower_counts()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.pages set followers_count = followers_count + 1 where id = new.page_id;
  elsif tg_op = 'DELETE' then
    update public.pages
      set followers_count = greatest(followers_count - 1, 0)
      where id = old.page_id;
  end if;
  return null;
end;
$$;

create or replace function bsdc.sync_event_rsvp_counts()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if tg_op = 'INSERT' and new.status = 'going' then
    update public.events set going_count = going_count + 1 where id = new.event_id;
  elsif tg_op = 'UPDATE' and old.status <> 'going' and new.status = 'going' then
    update public.events set going_count = going_count + 1 where id = new.event_id;
  elsif tg_op = 'UPDATE' and old.status = 'going' and new.status <> 'going' then
    update public.events
      set going_count = greatest(going_count - 1, 0) where id = new.event_id;
  elsif tg_op = 'DELETE' and old.status = 'going' then
    update public.events
      set going_count = greatest(going_count - 1, 0) where id = old.event_id;
  end if;
  return null;
end;
$$;

-- --------------------------- opportunities ---------------------------------
create or replace function bsdc.sync_application_counts()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
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

create or replace function bsdc.sync_proposal_counts()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
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

create or replace function bsdc.sync_project_stars()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.projects set stars_count = stars_count + 1 where id = new.project_id;
  elsif tg_op = 'DELETE' then
    update public.projects
      set stars_count = greatest(stars_count - 1, 0)
      where id = old.project_id;
  end if;
  return null;
end;
$$;

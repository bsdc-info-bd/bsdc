-- ---------------------------------------------------------------------------
-- Row level security for the content engine.
--
-- Reading a post goes through bsdc.can_read_post(), so drafts, follower-only
-- posts and removed posts are filtered by the database rather than by the
-- client. Authors may only ever write their own rows, and counters stay
-- server-owned through column-level grants.
-- ---------------------------------------------------------------------------

alter table public.tags           enable row level security;
alter table public.posts          enable row level security;
alter table public.post_tags      enable row level security;
alter table public.post_media     enable row level security;
alter table public.post_mentions  enable row level security;
alter table public.poll_options   enable row level security;
alter table public.poll_votes     enable row level security;
alter table public.post_revisions enable row level security;

-- ------------------------------- tags --------------------------------------
drop policy if exists tags_read_all on public.tags;
create policy tags_read_all on public.tags for select using (true);

drop policy if exists tags_write_staff on public.tags;
create policy tags_write_staff on public.tags
  for all using (bsdc.is_staff()) with check (bsdc.is_staff());

-- ------------------------------- posts -------------------------------------
drop policy if exists posts_read_visible on public.posts;
create policy posts_read_visible on public.posts
  for select using (
    status <> 'removed'
    and bsdc.can_read_post(author_uid, status, visibility)
  );

drop policy if exists posts_insert_self on public.posts;
create policy posts_insert_self on public.posts
  for insert with check (author_uid = bsdc.current_uid());

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update
  using (author_uid = bsdc.current_uid() or bsdc.is_staff())
  with check (author_uid = bsdc.current_uid() or bsdc.is_staff());

drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts
  for delete using (author_uid = bsdc.current_uid() or bsdc.is_staff());

revoke update on public.posts from anon, authenticated;
grant update (
  kind, status, visibility, title, body, excerpt, cover_url, language,
  code, code_language, reading_time, is_sensitive, allow_comments,
  published_at, slug
) on public.posts to authenticated;

-- ----------------------------- post_tags ------------------------------------
drop policy if exists post_tags_read_all on public.post_tags;
create policy post_tags_read_all on public.post_tags for select using (true);

drop policy if exists post_tags_write_author on public.post_tags;
create policy post_tags_write_author on public.post_tags
  for all
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_tags.post_id and p.author_uid = bsdc.current_uid()
    )
  )
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_tags.post_id and p.author_uid = bsdc.current_uid()
    )
  );

-- ----------------------------- post_media -----------------------------------
drop policy if exists post_media_read_all on public.post_media;
create policy post_media_read_all on public.post_media for select using (true);

drop policy if exists post_media_write_author on public.post_media;
create policy post_media_write_author on public.post_media
  for all
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_media.post_id and p.author_uid = bsdc.current_uid()
    )
  )
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_media.post_id and p.author_uid = bsdc.current_uid()
    )
  );

-- --------------------------- post_mentions ----------------------------------
drop policy if exists post_mentions_read_all on public.post_mentions;
create policy post_mentions_read_all on public.post_mentions for select using (true);

drop policy if exists post_mentions_write_author on public.post_mentions;
create policy post_mentions_write_author on public.post_mentions
  for all
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_mentions.post_id and p.author_uid = bsdc.current_uid()
    )
  )
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_mentions.post_id and p.author_uid = bsdc.current_uid()
    )
  );

-- ---------------------------- poll_options ----------------------------------
drop policy if exists poll_options_read_all on public.poll_options;
create policy poll_options_read_all on public.poll_options for select using (true);

drop policy if exists poll_options_write_author on public.poll_options;
create policy poll_options_write_author on public.poll_options
  for all
  using (
    exists (
      select 1 from public.posts p
      where p.id = poll_options.post_id and p.author_uid = bsdc.current_uid()
    )
  )
  with check (
    exists (
      select 1 from public.posts p
      where p.id = poll_options.post_id and p.author_uid = bsdc.current_uid()
    )
  );

revoke update on public.poll_options from anon, authenticated;
grant update (label, "position") on public.poll_options to authenticated;

-- ----------------------------- poll_votes -----------------------------------
drop policy if exists poll_votes_read_all on public.poll_votes;
create policy poll_votes_read_all on public.poll_votes for select using (true);

drop policy if exists poll_votes_delete_self on public.poll_votes;
create policy poll_votes_delete_self on public.poll_votes
  for delete using (voter_uid = bsdc.current_uid());

-- --------------------------- post_revisions ---------------------------------
drop policy if exists post_revisions_read_author on public.post_revisions;
create policy post_revisions_read_author on public.post_revisions
  for select using (
    bsdc.is_staff()
    or exists (
      select 1 from public.posts p
      where p.id = post_revisions.post_id and p.author_uid = bsdc.current_uid()
    )
  );

-- ------------------------------ grants --------------------------------------
grant select on public.tags, public.posts, public.post_tags, public.post_media,
  public.post_mentions, public.poll_options, public.poll_votes to anon, authenticated;
grant insert on public.posts, public.post_tags, public.post_media,
  public.post_mentions, public.poll_options to authenticated;
grant delete on public.posts, public.post_tags, public.post_media,
  public.post_mentions, public.poll_options, public.poll_votes to authenticated;
grant execute on function public.cast_poll_vote(uuid, uuid) to authenticated;
grant execute on function public.increment_post_view(uuid) to anon, authenticated;
grant execute on function bsdc.can_read_post(text, bsdc_post_status, bsdc_visibility)
  to anon, authenticated;

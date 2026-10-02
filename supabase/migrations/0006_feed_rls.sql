-- ---------------------------------------------------------------------------
-- Row level security for the feed tables.
--
-- Preferences, impressions and affinity are private to the member they
-- describe: nobody can read what someone else has seen or cares about.
-- ---------------------------------------------------------------------------

alter table public.feed_preferences enable row level security;
alter table public.feed_seen        enable row level security;
alter table public.topic_affinity   enable row level security;

drop policy if exists feed_preferences_self on public.feed_preferences;
create policy feed_preferences_self on public.feed_preferences
  for all
  using (uid = bsdc.current_uid())
  with check (uid = bsdc.current_uid());

drop policy if exists feed_seen_self on public.feed_seen;
create policy feed_seen_self on public.feed_seen
  for all
  using (uid = bsdc.current_uid())
  with check (uid = bsdc.current_uid());

drop policy if exists topic_affinity_self on public.topic_affinity;
create policy topic_affinity_self on public.topic_affinity
  for select using (uid = bsdc.current_uid());

-- Affinity is only ever written by the security-definer functions above, so
-- a member cannot inflate their own scores or anybody else's.

grant select, insert, update, delete on public.feed_preferences to authenticated;
grant select, insert, delete on public.feed_seen to authenticated;
grant select on public.topic_affinity to authenticated;
grant execute on function public.record_feed_impression(uuid) to authenticated;
grant execute on function public.feed_candidates(integer, timestamptz) to anon, authenticated;
grant execute on function public.feed_new_count(timestamptz) to anon, authenticated;
grant execute on function public.prune_feed_seen(integer) to authenticated;

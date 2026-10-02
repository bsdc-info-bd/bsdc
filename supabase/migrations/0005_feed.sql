-- ---------------------------------------------------------------------------
-- BSDC feed support.
--
-- The ranking itself runs in four stages (candidates, filtering, scoring,
-- diversity). Postgres owns the parts that must not be trusted to a browser:
-- which posts a viewer may see at all, which ones they have already seen,
-- and the engagement signals used for scoring. The arithmetic of ranking
-- runs client-side on the small candidate set so it stays cheap and testable.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- feed_preferences — per member feed controls
-- ---------------------------------------------------------------------------
create table if not exists public.feed_preferences (
  uid              text primary key references public.profiles (uid) on delete cascade,
  algorithm        text        not null default 'ranked'
                     check (algorithm in ('ranked', 'following', 'latest')),
  languages        text[]      not null default array['bn', 'en'],
  muted_tags       text[]      not null default '{}',
  show_sensitive   boolean     not null default false,
  hide_seen        boolean     not null default true,
  updated_at       timestamptz not null default now()
);

drop trigger if exists feed_preferences_touch on public.feed_preferences;
create trigger feed_preferences_touch before update on public.feed_preferences
  for each row execute function bsdc.touch_updated_at();

-- ---------------------------------------------------------------------------
-- feed_seen — impressions, so the feed does not repeat itself
-- ---------------------------------------------------------------------------
create table if not exists public.feed_seen (
  uid     text        not null references public.profiles (uid) on delete cascade,
  post_id uuid        not null references public.posts (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (uid, post_id)
);

create index if not exists feed_seen_recent_idx on public.feed_seen (uid, seen_at desc);

-- Impressions older than thirty days stop being interesting; the admin
-- maintenance job calls this rather than letting the table grow without end.
create or replace function public.prune_feed_seen(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.feed_seen where seen_at < now() - make_interval(days => p_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- topic_affinity — how much a member engages with each tag
-- ---------------------------------------------------------------------------
create table if not exists public.topic_affinity (
  uid        text        not null references public.profiles (uid) on delete cascade,
  tag_slug   citext      not null references public.tags (slug) on delete cascade,
  score      real        not null default 0 check (score >= 0),
  updated_at timestamptz not null default now(),
  primary key (uid, tag_slug)
);

create index if not exists topic_affinity_top_idx on public.topic_affinity (uid, score desc);

-- Publishing about a topic is the strongest signal that it interests you.
create or replace function bsdc.bump_author_affinity()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc
as $$
declare
  v_author text;
begin
  select author_uid into v_author from public.posts where id = new.post_id;
  if v_author is null then
    return null;
  end if;

  insert into public.topic_affinity (uid, tag_slug, score, updated_at)
  values (v_author, new.tag_slug, 3, now())
  on conflict (uid, tag_slug)
  do update set score = least(public.topic_affinity.score + 3, 100), updated_at = now();

  return null;
end;
$$;

drop trigger if exists post_tags_affinity on public.post_tags;
create trigger post_tags_affinity after insert on public.post_tags
  for each row execute function bsdc.bump_author_affinity();

-- Reading a post is a weaker but far more frequent signal.
create or replace function public.record_feed_impression(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc
as $$
declare
  v_uid text := bsdc.current_uid();
begin
  if v_uid is null then
    return;
  end if;

  insert into public.feed_seen (uid, post_id) values (v_uid, p_post_id)
  on conflict (uid, post_id) do update set seen_at = now();

  insert into public.topic_affinity (uid, tag_slug, score, updated_at)
  select v_uid, pt.tag_slug, 0.5, now()
  from public.post_tags pt
  where pt.post_id = p_post_id
  on conflict (uid, tag_slug)
  do update set score = least(public.topic_affinity.score + 0.5, 100), updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- feed_candidates — stage one, run inside the database
-- ---------------------------------------------------------------------------
-- Returns the raw candidate set with the signals the client needs to score
-- it. RLS on public.posts still applies, so nothing a viewer may not read can
-- ever appear here.
create or replace function public.feed_candidates(
  p_limit integer default 60,
  p_before timestamptz default null
)
returns table (
  post_id          uuid,
  author_uid       text,
  published_at     timestamptz,
  likes_count      integer,
  comments_count   integer,
  views_count      integer,
  language         text,
  is_sensitive     boolean,
  kind             bsdc_post_kind,
  author_followed  boolean,
  affinity         real,
  already_seen     boolean,
  tags             text[]
)
language sql
stable
set search_path = public, bsdc
as $$
  select
    p.id,
    p.author_uid,
    p.published_at,
    p.likes_count,
    p.comments_count,
    p.views_count,
    p.language,
    p.is_sensitive,
    p.kind,
    exists (
      select 1 from public.follows f
      where f.follower_uid = bsdc.current_uid() and f.followee_uid = p.author_uid
    ) as author_followed,
    coalesce((
      select sum(ta.score)
      from public.topic_affinity ta
      join public.post_tags pt on pt.tag_slug = ta.tag_slug
      where ta.uid = bsdc.current_uid() and pt.post_id = p.id
    ), 0)::real as affinity,
    exists (
      select 1 from public.feed_seen s
      where s.uid = bsdc.current_uid() and s.post_id = p.id
    ) as already_seen,
    coalesce(array(
      select pt.tag_slug::text from public.post_tags pt where pt.post_id = p.id
    ), '{}') as tags
  from public.posts p
  where p.status = 'published'
    and (p_before is null or p.published_at < p_before)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_uid = bsdc.current_uid() and b.blocked_uid = p.author_uid)
         or (b.blocker_uid = p.author_uid and b.blocked_uid = bsdc.current_uid())
    )
  order by p.published_at desc
  limit least(greatest(p_limit, 1), 120);
$$;

-- How many newer posts exist than the one the reader is looking at.
create or replace function public.feed_new_count(p_since timestamptz)
returns integer
language sql
stable
set search_path = public, bsdc
as $$
  select count(*)::integer
  from public.posts p
  where p.status = 'published'
    and p.visibility = 'public'
    and p.published_at > p_since
    and p.author_uid <> coalesce(bsdc.current_uid(), '')
$$;

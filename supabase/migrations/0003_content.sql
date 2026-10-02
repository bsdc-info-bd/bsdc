-- ---------------------------------------------------------------------------
-- BSDC content engine.
--
-- One table carries every kind of contribution — status update, article,
-- question, poll, code snippet and media post — because they share ranking,
-- moderation, search and permalinks. Kind-specific data lives in dedicated
-- side tables (poll options, snippet metadata) rather than in nullable
-- columns scattered across the main table.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_post_kind') then
    create type bsdc_post_kind as enum ('post', 'article', 'question', 'poll', 'snippet', 'media');
  end if;

  if not exists (select 1 from pg_type where typname = 'bsdc_post_status') then
    create type bsdc_post_status as enum ('draft', 'published', 'archived', 'removed');
  end if;

  if not exists (select 1 from pg_type where typname = 'bsdc_visibility') then
    create type bsdc_visibility as enum ('public', 'followers', 'private');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------
create table if not exists public.tags (
  slug        citext primary key check (slug ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  label_en    text        not null,
  label_bn    text        not null default '',
  description text        not null default '',
  posts_count integer     not null default 0 check (posts_count >= 0),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  author_uid    text        not null references public.profiles (uid) on delete cascade,
  kind          bsdc_post_kind   not null default 'post',
  status        bsdc_post_status not null default 'draft',
  visibility    bsdc_visibility  not null default 'public',
  slug          citext      not null unique
                  check (slug ~ '^[a-z0-9][a-z0-9-]{2,119}$'),
  title         text        not null default '' check (char_length(title) <= 160),
  body          text        not null default '' check (char_length(body) <= 60000),
  excerpt       text        not null default '' check (char_length(excerpt) <= 320),
  cover_url     text        not null default '',
  language      text        not null default 'bn' check (language in ('bn', 'en')),
  -- snippet payload
  code          text        not null default '' check (char_length(code) <= 20000),
  code_language text        not null default '',
  -- counters maintained by triggers and by the interaction module
  reading_time  integer     not null default 1 check (reading_time between 1 and 180),
  views_count   integer     not null default 0 check (views_count >= 0),
  likes_count   integer     not null default 0 check (likes_count >= 0),
  comments_count integer    not null default 0 check (comments_count >= 0),
  is_pinned     boolean     not null default false,
  is_sensitive  boolean     not null default false,
  allow_comments boolean    not null default true,
  published_at  timestamptz,
  edited_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B') ||
    setweight(to_tsvector('simple', left(coalesce(body, ''), 20000)), 'C')
  ) stored,
  constraint posts_published_has_timestamp
    check (status <> 'published' or published_at is not null),
  constraint posts_article_has_title
    check (kind <> 'article' or char_length(title) >= 3),
  constraint posts_question_has_title
    check (kind <> 'question' or char_length(title) >= 3),
  constraint posts_snippet_has_code
    check (kind <> 'snippet' or char_length(code) >= 1)
);

create index if not exists posts_feed_idx
  on public.posts (status, visibility, published_at desc nulls last);
create index if not exists posts_author_idx on public.posts (author_uid, created_at desc);
create index if not exists posts_search_idx on public.posts using gin (search_vector);
create index if not exists posts_kind_idx on public.posts (kind, published_at desc nulls last);

drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts
  for each row execute function bsdc.touch_updated_at();

-- Author post counters stay accurate without a second round trip.
create or replace function bsdc.sync_post_counts()
returns trigger
language plpgsql
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

drop trigger if exists posts_sync_counts on public.posts;
create trigger posts_sync_counts after insert or update or delete on public.posts
  for each row execute function bsdc.sync_post_counts();

-- ---------------------------------------------------------------------------
-- post_tags, post_media, mentions
-- ---------------------------------------------------------------------------
create table if not exists public.post_tags (
  post_id  uuid   not null references public.posts (id) on delete cascade,
  tag_slug citext not null references public.tags (slug) on delete cascade,
  primary key (post_id, tag_slug)
);

create index if not exists post_tags_tag_idx on public.post_tags (tag_slug);

create or replace function bsdc.sync_tag_counts()
returns trigger
language plpgsql
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

drop trigger if exists post_tags_sync_counts on public.post_tags;
create trigger post_tags_sync_counts after insert or delete on public.post_tags
  for each row execute function bsdc.sync_tag_counts();

create table if not exists public.post_media (
  post_id    uuid    not null references public.posts (id) on delete cascade,
  media_id   uuid    not null references public.media_assets (id) on delete cascade,
  "position" integer not null default 0 check ("position" >= 0),
  alt_text   text    not null default '' check (char_length(alt_text) <= 280),
  primary key (post_id, media_id)
);

create table if not exists public.post_mentions (
  post_id       uuid not null references public.posts (id) on delete cascade,
  mentioned_uid text not null references public.profiles (uid) on delete cascade,
  primary key (post_id, mentioned_uid)
);

create index if not exists post_mentions_uid_idx on public.post_mentions (mentioned_uid);

-- ---------------------------------------------------------------------------
-- polls
-- ---------------------------------------------------------------------------
create table if not exists public.poll_options (
  id       uuid primary key default gen_random_uuid(),
  post_id  uuid    not null references public.posts (id) on delete cascade,
  "position" integer not null check ("position" between 0 and 9),
  label    text    not null check (char_length(label) between 1 and 80),
  votes    integer not null default 0 check (votes >= 0),
  unique (post_id, "position")
);

create table if not exists public.poll_votes (
  post_id   uuid        not null references public.posts (id) on delete cascade,
  voter_uid text        not null references public.profiles (uid) on delete cascade,
  option_id uuid        not null references public.poll_options (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, voter_uid)
);

create or replace function bsdc.sync_poll_votes()
returns trigger
language plpgsql
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

drop trigger if exists poll_votes_sync on public.poll_votes;
create trigger poll_votes_sync after insert or delete on public.poll_votes
  for each row execute function bsdc.sync_poll_votes();

-- One ballot per member: changing a vote moves it instead of adding a second.
create or replace function public.cast_poll_vote(p_post_id uuid, p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc
as $$
declare
  v_uid text := bsdc.current_uid();
begin
  if v_uid is null then
    raise exception 'auth/required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.poll_options o where o.id = p_option_id and o.post_id = p_post_id
  ) then
    raise exception 'poll/option-mismatch' using errcode = '22023';
  end if;

  delete from public.poll_votes where post_id = p_post_id and voter_uid = v_uid;
  insert into public.poll_votes (post_id, voter_uid, option_id)
  values (p_post_id, v_uid, p_option_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- post_revisions — every published edit is kept
-- ---------------------------------------------------------------------------
create table if not exists public.post_revisions (
  id         bigserial primary key,
  post_id    uuid        not null references public.posts (id) on delete cascade,
  editor_uid text        not null,
  title      text        not null default '',
  body       text        not null default '',
  created_at timestamptz not null default now()
);

create index if not exists post_revisions_post_idx
  on public.post_revisions (post_id, created_at desc);

create or replace function bsdc.record_post_revision()
returns trigger
language plpgsql
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

drop trigger if exists posts_record_revision on public.posts;
create trigger posts_record_revision before update on public.posts
  for each row execute function bsdc.record_post_revision();

-- ---------------------------------------------------------------------------
-- Reading helpers
-- ---------------------------------------------------------------------------

-- A post is visible when it is published and public, when the viewer wrote it,
-- when the viewer follows a followers-only author, or when the viewer is staff.
create or replace function bsdc.can_read_post(
  p_author_uid text,
  p_status bsdc_post_status,
  p_visibility bsdc_visibility
)
returns boolean
language sql
stable
as $$
  select
    case
      when bsdc.current_uid() = p_author_uid then true
      when bsdc.is_staff() then true
      when p_status <> 'published' then false
      when p_visibility = 'public' then true
      when p_visibility = 'followers' then exists (
        select 1 from public.follows f
        where f.followee_uid = p_author_uid and f.follower_uid = bsdc.current_uid()
      )
      else false
    end
$$;

create or replace function public.increment_post_view(p_post_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.posts set views_count = views_count + 1 where id = p_post_id;
$$;

insert into public.tags (slug, label_en, label_bn, description) values
  ('javascript',  'JavaScript',  'জাভাস্ক্রিপ্ট',   'The language of the web'),
  ('typescript',  'TypeScript',  'টাইপস্ক্রিপ্ট',   'Typed JavaScript at scale'),
  ('react',       'React',       'রিঅ্যাক্ট',       'Component based user interfaces'),
  ('nodejs',      'Node.js',     'নোড.জেএস',        'JavaScript on the server'),
  ('php',         'PHP',         'পিএইচপি',         'Server side scripting'),
  ('laravel',     'Laravel',     'লারাভেল',         'PHP application framework'),
  ('python',      'Python',      'পাইথন',           'General purpose programming'),
  ('flutter',     'Flutter',     'ফ্লাটার',          'Cross platform applications'),
  ('android',     'Android',     'অ্যান্ড্রয়েড',     'Android development'),
  ('devops',      'DevOps',      'ডেভঅপস',          'Build, ship and operate'),
  ('career',      'Career',      'ক্যারিয়ার',        'Jobs, interviews and growth'),
  ('freelancing', 'Freelancing', 'ফ্রিল্যান্সিং',    'Working with global clients'),
  ('open-source', 'Open source', 'ওপেন সোর্স',      'Public code and collaboration'),
  ('security',    'Security',    'নিরাপত্তা',        'Application and data security'),
  ('ui-design',   'UI design',   'ইউআই ডিজাইন',     'Interface and interaction design')
on conflict (slug) do nothing;

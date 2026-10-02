-- ---------------------------------------------------------------------------
-- Search, and the notification preferences that were until now only a form.
--
-- Two deliberate choices. Search runs as the caller, not as a definer: the
-- ordinary row policies decide what a member may find, so a secret group or
-- an unpublished course can never surface in results. And the search log
-- stores the words typed, never who typed them.
--
-- The text configuration is 'simple' on purpose. English stemming would
-- mangle Bangla, and this platform is bilingual; prefix and trigram matching
-- carry the fuzzy work instead.
-- ---------------------------------------------------------------------------

-- --------------------------- immutable helpers ------------------------------
-- `array_to_string()` is declared STABLE, not IMMUTABLE, because in general it
-- depends on a type's output function. A stored generated column may only use
-- immutable expressions, so Postgres refuses the whole statement with
-- "generation expression is not immutable". Joining an array of text is in
-- fact deterministic, and this wrapper says so — narrowed to text[] rather
-- than anyarray, which is the part that makes the claim true.
create or replace function bsdc.join_text(p_values text[], p_separator text default ' ')
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select coalesce(array_to_string(coalesce(p_values, '{}'::text[]), p_separator), '')
$$;

-- --------------------------- searchable columns -----------------------------
alter table public.profiles
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(display_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(username::text, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(bio, '')), 'C') ||
    setweight(to_tsvector('simple', bsdc.join_text(skills)), 'B')
  ) stored;

alter table public.groups
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C')
  ) stored;

alter table public.courses
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('simple', bsdc.join_text(tags)), 'B')
  ) stored;

alter table public.jobs
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(company, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(city, '')), 'C') ||
    setweight(to_tsvector('simple', bsdc.join_text(skills)), 'B')
  ) stored;

alter table public.projects
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(tagline, '')), 'B') ||
    setweight(to_tsvector('simple', bsdc.join_text(tech)), 'B')
  ) stored;

create index if not exists profiles_search_idx on public.profiles using gin (search_vector);
create index if not exists groups_search_idx   on public.groups   using gin (search_vector);
create index if not exists courses_search_idx  on public.courses  using gin (search_vector);
create index if not exists jobs_search_idx     on public.jobs     using gin (search_vector);
create index if not exists projects_search_idx on public.projects using gin (search_vector);

-- Trigram indexes carry the typo-tolerant half of suggestions.
create index if not exists groups_name_trgm on public.groups using gin (name gin_trgm_ops);
create index if not exists courses_title_trgm on public.courses using gin (title gin_trgm_ops);
create index if not exists jobs_title_trgm on public.jobs using gin (title gin_trgm_ops);

-- --------------------------- the search query --------------------------------
-- A member types words, not tsquery syntax. Every word becomes a prefix term
-- so "post" finds "postgres" while typing, and punctuation is discarded
-- rather than throwing a syntax error back at the member.
create or replace function bsdc.to_search_query(p_input text)
returns tsquery
language plpgsql
immutable
set search_path = public, bsdc, pg_temp
as $$
declare
  v_words text[];
  v_terms text[];
  v_word  text;
begin
  v_words := regexp_split_to_array(lower(btrim(coalesce(p_input, ''))), '\s+');
  v_terms := array[]::text[];

  foreach v_word in array v_words loop
    -- [:alnum:] is Unicode-aware in a UTF-8 database, so Bangla letters
    -- survive while punctuation is discarded.
    v_word := regexp_replace(v_word, '[^[:alnum:]_]', '', 'g');
    if char_length(v_word) > 0 then
      v_terms := v_terms || (quote_literal(v_word) || ':*');
    end if;
  end loop;

  if array_length(v_terms, 1) is null then
    return null;
  end if;
  return to_tsquery('simple', array_to_string(v_terms, ' & '));
end;
$$;

-- ------------------------------ search log -----------------------------------
-- What the community looks for, never who looked. There is no uid column by
-- design, so "trending searches" cannot be turned into a profile of a member.
create table if not exists public.search_log (
  id           uuid primary key default gen_random_uuid(),
  term         text not null check (char_length(btrim(term)) between 1 and 120),
  result_count integer not null default 0 check (result_count >= 0),
  searched_at  timestamptz not null default now()
);

create index if not exists search_log_term_idx on public.search_log (term, searched_at desc);
create index if not exists search_log_recent_idx on public.search_log (searched_at desc);

create or replace function public.log_search(p_term text, p_results integer)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_term text := lower(btrim(coalesce(p_term, '')));
begin
  -- Single characters and empty strings tell us nothing and are not stored.
  if char_length(v_term) < 2 then
    return;
  end if;
  insert into public.search_log (term, result_count)
    values (left(v_term, 120), greatest(coalesce(p_results, 0), 0));
end;
$$;

create or replace function public.trending_searches(p_limit integer default 8)
returns table (term text, uses integer)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select term, count(*)::integer as uses
  from public.search_log
  where searched_at > now() - interval '7 days' and result_count > 0
  group by term
  having count(*) >= 2
  order by uses desc, term
  limit greatest(1, least(p_limit, 20));
$$;

-- ------------------------------ global search --------------------------------
-- security invoker (the default): the row policies of each table decide what
-- this member is allowed to find. A private profile that opted out of
-- discovery is excluded here as well.
create or replace function public.global_search(
  p_query text,
  p_kinds text[] default null,
  p_limit integer default 30
)
returns table (
  kind      text,
  id        text,
  slug      text,
  title     text,
  subtitle  text,
  image_url text,
  rank      real,
  created_at timestamptz
)
language sql
stable
set search_path = public, bsdc, pg_temp
as $$
  with q as (select bsdc.to_search_query(p_query) as query),
  wanted as (
    select coalesce(p_kinds, array['post','person','group','course','job','project']) as kinds
  ),
  results as (
    select 'post' as kind, p.id::text as id, p.slug::text as slug,
           coalesce(nullif(p.title, ''), left(p.body, 80)) as title,
           left(p.excerpt, 160) as subtitle, p.cover_url as image_url,
           ts_rank(p.search_vector, q.query) as rank, p.created_at as created_at
    from public.posts p, q, wanted w
    where 'post' = any (w.kinds)
      and q.query is not null
      and p.status = 'published'
      and p.visibility = 'public'
      and p.search_vector @@ q.query

    union all
    select 'person', pr.uid, coalesce(pr.username::text, ''), pr.display_name,
           left(pr.bio, 160), pr.avatar_url,
           ts_rank(pr.search_vector, q.query), pr.created_at
    from public.profiles pr, q, wanted w
    where 'person' = any (w.kinds)
      and q.query is not null
      and pr.status = 'active'
      and coalesce((pr.privacy ->> 'discoverable')::boolean, true)
      and pr.search_vector @@ q.query

    union all
    select 'group', g.id::text, g.slug::text, g.name,
           left(g.description, 160), g.avatar_url,
           ts_rank(g.search_vector, q.query), g.created_at
    from public.groups g, q, wanted w
    where 'group' = any (w.kinds)
      and q.query is not null
      and not g.is_archived
      and g.search_vector @@ q.query

    union all
    select 'course', c.id::text, c.slug::text, c.title,
           left(c.summary, 160), c.cover_url,
           ts_rank(c.search_vector, q.query), c.created_at
    from public.courses c, q, wanted w
    where 'course' = any (w.kinds)
      and q.query is not null
      and c.status = 'published'
      and c.search_vector @@ q.query

    union all
    select 'job', j.id::text, j.slug::text, j.title,
           j.company || ' · ' || coalesce(nullif(j.city, ''), j.work_mode::text), '',
           ts_rank(j.search_vector, q.query), j.created_at
    from public.jobs j, q, wanted w
    where 'job' = any (w.kinds)
      and q.query is not null
      and j.status = 'open'
      and (j.expires_at is null or j.expires_at > now())
      and j.search_vector @@ q.query

    union all
    select 'project', pj.id::text, pj.slug::text, pj.name,
           left(pj.tagline, 160), pj.cover_url,
           ts_rank(pj.search_vector, q.query), pj.created_at
    from public.projects pj, q, wanted w
    where 'project' = any (w.kinds)
      and q.query is not null
      and pj.search_vector @@ q.query
  )
  select r.kind, r.id, r.slug, r.title, r.subtitle, r.image_url, r.rank, r.created_at
  from results r
  order by r.rank desc, r.created_at desc
  limit greatest(1, least(p_limit, 100));
$$;

-- Fast, small payload for the command palette: titles only, trigram ordered.
create or replace function public.search_suggestions(p_prefix text, p_limit integer default 8)
returns table (kind text, slug text, title text)
language sql
stable
set search_path = public, bsdc, pg_temp
as $$
  with term as (select lower(btrim(coalesce(p_prefix, ''))) as value)
  -- The ranking column is computed in the subquery and dropped here: the
  -- function promises three columns, and `select *` would hand back four.
  select matches.kind, matches.slug, matches.title from (
    select 'person' as kind, coalesce(pr.username::text, '') as slug, pr.display_name as title,
           similarity(pr.display_name, (select value from term)) as score
    from public.profiles pr
    where (select char_length(value) from term) >= 2
      and pr.status = 'active'
      and coalesce((pr.privacy ->> 'discoverable')::boolean, true)
      and (pr.display_name ilike '%' || (select value from term) || '%'
           or pr.username::text ilike (select value from term) || '%')
    union all
    select 'group', g.slug::text, g.name, similarity(g.name, (select value from term))
    from public.groups g
    where (select char_length(value) from term) >= 2
      and not g.is_archived
      and g.name ilike '%' || (select value from term) || '%'
    union all
    select 'course', c.slug::text, c.title, similarity(c.title, (select value from term))
    from public.courses c
    where (select char_length(value) from term) >= 2
      and c.status = 'published'
      and c.title ilike '%' || (select value from term) || '%'
  ) as matches
  order by matches.score desc, matches.title
  limit greatest(1, least(p_limit, 20));
$$;

-- ---------------------------------------------------------------------------
-- Notification preferences, finally honoured.
--
-- profiles.notifications has existed since the first migration and the
-- settings screen has been writing to it. Until now nothing read it. Every
-- notification kind is mapped to the switch that governs it; an unmapped kind
-- (moderation) is always delivered, because a member must hear about that.
-- ---------------------------------------------------------------------------
create or replace function bsdc.notification_allowed(
  p_uid  text,
  p_kind bsdc_notification_kind
)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select case p_kind
    when 'follow'  then coalesce((p.notifications ->> 'followers')::boolean, true)
    when 'comment' then coalesce((p.notifications ->> 'comments')::boolean, true)
    when 'reply'   then coalesce((p.notifications ->> 'comments')::boolean, true)
    when 'mention' then coalesce((p.notifications ->> 'mentions')::boolean, true)
    else true
  end
  from public.profiles p
  where p.uid = p_uid;
$$;

create or replace function bsdc.notify(
  p_uid        text,
  p_actor_uid  text,
  p_kind       bsdc_notification_kind,
  p_post_id    uuid default null,
  p_comment_id uuid default null,
  p_body       text default ''
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if p_uid is null or p_uid = p_actor_uid then
    return;
  end if;

  -- A block in either direction silences the notification entirely.
  if exists (
    select 1 from public.blocks
    where (blocker_uid = p_uid and blocked_uid = p_actor_uid)
       or (blocker_uid = p_actor_uid and blocked_uid = p_uid)
  ) then
    return;
  end if;

  -- The member's own switches, read on the way in rather than filtered on the
  -- way out: a muted kind is never stored at all.
  if not coalesce(bsdc.notification_allowed(p_uid, p_kind), true) then
    return;
  end if;

  insert into public.notifications (uid, actor_uid, kind, post_id, comment_id, body)
  values (p_uid, p_actor_uid, p_kind, p_post_id, p_comment_id, left(coalesce(p_body, ''), 280))
  on conflict (uid, actor_uid, kind, coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set created_at = now(), read_at = null, body = excluded.body;
end;
$$;

-- --------------------------------- grants -----------------------------------
alter table public.search_log enable row level security;

-- Nobody reads the raw log directly; trending_searches() aggregates it as the
-- definer, so an individual search is never attributable or even listable.
-- The refusal is written down as a policy rather than left implicit: a table
-- with row level security and no policy denies everything already, but then
-- the denial looks like an omission, and the next person to read the file
-- cannot tell whether a policy was forgotten. This one says it out loud, and
-- it is what the schema invariant "every table carries a policy" checks.
drop policy if exists search_log_no_direct_reads on public.search_log;
create policy search_log_no_direct_reads on public.search_log
  for select using (false);

revoke all on public.search_log from anon, authenticated;

grant execute on function public.global_search(text, text[], integer) to anon, authenticated;
grant execute on function public.search_suggestions(text, integer) to anon, authenticated;
grant execute on function public.trending_searches(integer) to anon, authenticated;
grant execute on function public.log_search(text, integer) to anon, authenticated;

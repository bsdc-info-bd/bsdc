-- 0124 — a tag a member types is a tag, not a suggestion.
--
-- The composer offers the curated vocabulary and lets a member type any tag they
-- like, and the save then attached only the words that already existed in
-- `public.tags`. Everything else was dropped in silence: the chip was on screen,
-- the post was published, and the tag was not on it. From the member's side that
-- is "the tag system does not work", and there was nothing to read that said
-- otherwise.
--
-- A tag is now created when it is used. The vocabulary still exists and still
-- supplies the bilingual labels for the words it knows; a new word gets the slug
-- as its English label, an empty Bangla label, and can be translated later
-- without touching a single post.
--
-- The insert is a member write, so it needs a grant and a policy like every
-- other member write. The policy only requires a signed-in member — the shape of
-- the slug is already a column constraint (`^[a-z0-9][a-z0-9-]{0,31}$`), and the
-- save path normalises before it gets here.

grant insert on public.tags to authenticated;

drop policy if exists tags_insert_member on public.tags;
create policy tags_insert_member on public.tags
  for insert with check (bsdc.current_uid() is not null);

-- ------------------------------------------------------------ the save path ---
-- `save_post` gains one step: create any tag it is about to attach. The
-- `on conflict do nothing` keeps this a no-op for the curated words, and the
-- insert happens inside the same transaction as the post, so a tag that fails to
-- be created fails the save rather than being dropped from it.

create or replace function public.save_post(
  p_id uuid default null,
  p_post jsonb default '{}'::jsonb,
  p_slug text default null,
  p_tags text[] default '{}'::text[],
  p_media jsonb default '[]'::jsonb,
  p_mentions text[] default '{}'::text[],
  p_poll jsonb default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid      text := bsdc.current_uid();
  v_id       uuid := p_id;
  v_slug     text;
  v_status   bsdc_post_status := coalesce((p_post ->> 'status')::bsdc_post_status, 'draft');
  v_attempt  integer := 0;
  v_stored   jsonb;
  v_incoming jsonb;
  v_tags     text[];
begin
  -- The tags this save carries, normalised and de-duplicated once, so every
  -- later step reads the same list.
  select coalesce(array_agg(distinct w order by w), '{}')
    into v_tags
    from unnest(coalesce(p_tags, '{}'::text[])) as w
   where char_length(btrim(w)) >= 2;

  -- The vocabulary grows by exactly the words this post uses.
  if array_length(v_tags, 1) is not null then
    insert into public.tags (slug, label_en, label_bn)
    select w, initcap(replace(w, '-', ' ')), ''
      from unnest(v_tags) as w
    on conflict (slug) do nothing;
  end if;

  if p_id is null then
    if coalesce(btrim(p_slug), '') = '' then
      raise exception 'post/slug-missing';
    end if;

    loop
      v_attempt := v_attempt + 1;
      begin
        insert into public.posts (
          author_uid, slug, kind, status, visibility, title, body, excerpt, cover_url,
          language, code, code_language, reading_time, is_sensitive, allow_comments,
          published_at
        )
        values (
          v_uid,
          btrim(p_slug) || case when v_attempt = 1 then '' else '-' || v_attempt::text end,
          coalesce((p_post ->> 'kind')::bsdc_post_kind, 'post'),
          v_status,
          coalesce((p_post ->> 'visibility')::bsdc_visibility, 'public'),
          coalesce(p_post ->> 'title', ''),
          coalesce(p_post ->> 'body', ''),
          coalesce(p_post ->> 'excerpt', ''),
          coalesce(p_post ->> 'cover_url', ''),
          coalesce(p_post ->> 'language', 'bn'),
          coalesce(p_post ->> 'code', ''),
          coalesce(p_post ->> 'code_language', ''),
          coalesce((p_post ->> 'reading_time')::integer, 1),
          coalesce((p_post ->> 'is_sensitive')::boolean, false),
          coalesce((p_post ->> 'allow_comments')::boolean, true),
          case when v_status = 'published' then now() else null end
        )
        returning id, slug into v_id, v_slug;
        exit;
      exception
        when unique_violation then
          if v_attempt >= 10 then
            raise;
          end if;
      end;
    end loop;
  else
    update public.posts p
       set kind           = coalesce((p_post ->> 'kind')::bsdc_post_kind, p.kind),
           status         = v_status,
           visibility     = coalesce((p_post ->> 'visibility')::bsdc_visibility, p.visibility),
           title          = coalesce(p_post ->> 'title', p.title),
           body           = coalesce(p_post ->> 'body', p.body),
           excerpt        = coalesce(p_post ->> 'excerpt', p.excerpt),
           cover_url      = coalesce(p_post ->> 'cover_url', p.cover_url),
           language       = coalesce(p_post ->> 'language', p.language),
           code           = coalesce(p_post ->> 'code', p.code),
           code_language  = coalesce(p_post ->> 'code_language', p.code_language),
           reading_time   = coalesce((p_post ->> 'reading_time')::integer, p.reading_time),
           is_sensitive   = coalesce((p_post ->> 'is_sensitive')::boolean, p.is_sensitive),
           allow_comments = coalesce((p_post ->> 'allow_comments')::boolean, p.allow_comments),
           published_at   = case
                              when v_status = 'published' then coalesce(p.published_at, now())
                              else null
                            end
     where p.id = v_id
    returning p.slug into v_slug;

    if not found then
      raise exception 'post/not-found';
    end if;
  end if;

  -- ---------------------------------------------------------------- tags ---
  delete from public.post_tags where post_id = v_id;
  insert into public.post_tags (post_id, tag_slug)
  select v_id, w from unnest(v_tags) as w
  on conflict do nothing;

  -- --------------------------------------------------------------- media ---
  delete from public.post_media where post_id = v_id;
  insert into public.post_media (post_id, media_id, "position", alt_text)
  select v_id,
         (item ->> 'media_id')::uuid,
         coalesce((item ->> 'position')::integer, (fpos - 1)::integer),
         coalesce(item ->> 'alt_text', '')
    from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) with ordinality as f(item, fpos)
   where coalesce(item ->> 'media_id', '') <> ''
  on conflict do nothing;

  -- ------------------------------------------------------------ mentions ---
  delete from public.post_mentions where post_id = v_id;
  insert into public.post_mentions (post_id, mentioned_uid)
  select v_id, pr.uid
    from public.profiles pr
   where pr.username = any (coalesce(p_mentions, '{}'::text[]))
  on conflict do nothing;

  -- ---------------------------------------------------------------- poll ---
  if p_poll is not null and jsonb_typeof(p_poll) = 'array' then
    if jsonb_array_length(p_poll) = 0 then
      delete from public.poll_options where post_id = v_id;
    else
      select jsonb_agg(st.label order by st."position")
        into v_stored
        from public.poll_options st
       where st.post_id = v_id;

      select jsonb_agg(o.label order by o.opos)
        into v_incoming
        from jsonb_array_elements_text(p_poll) with ordinality as o(label, opos);

      if v_stored is distinct from v_incoming then
        delete from public.poll_options where post_id = v_id;
        insert into public.poll_options (post_id, "position", label)
        select v_id, (o.opos - 1)::integer, o.label
          from jsonb_array_elements_text(p_poll) with ordinality as o(label, opos);
      end if;
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end;
$$;

revoke all on function public.save_post(uuid, jsonb, text, text[], jsonb, text[], jsonb) from public;
grant execute on function public.save_post(uuid, jsonb, text, text[], jsonb, text[], jsonb)
  to authenticated;

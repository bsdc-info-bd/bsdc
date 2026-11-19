-- 0123 — a post is saved once, or not at all.
--
-- Composing a post was up to nine requests from the client: the post row, then
-- tags, media, mentions and the poll, each its own statement, each able to fail
-- on its own. A save that failed at the fourth one left the post published with
-- no pictures, no tags and no mention notifications, and the member was shown an
-- error for a post that existed. On a phone, nine sequential round trips is also
-- most of a second spent waiting for work the server can do at once.
--
-- `public.save_post` is that save, in one statement. It is `security invoker`, so
-- every row level security policy and every column grant that applied to the nine
-- requests applies inside it, unchanged — this is not a way around the policies,
-- it is the same write in one transaction.
--
-- What it keeps, deliberately:
--
--   * the slug is the one the client generated (`uniqueSlug`); if two members
--     save the same title at the same moment the second insert retries with a
--     numbered suffix inside the transaction instead of failing;
--   * `published_at` is preserved on an edit of a published post and cleared when
--     the post goes back to draft — the same rule the client applied with an
--     extra read;
--   * tags are matched against the curated vocabulary, so an unknown word is
--     dropped rather than inventing taxonomy;
--   * a poll whose labels did not change is not written at all, and a poll whose
--     ballot exists cannot be rewritten (`poll_options_keep_votes`, 0121) — and
--     the failed poll write now rolls the whole save back, so there is never a
--     published post with a half-written poll;
--   * deleting the post still deletes its poll: the poll guard distinguishes a
--     cascade from a client delete.

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
begin
  if p_id is null then
    if coalesce(btrim(p_slug), '') = '' then
      raise exception 'post/slug-missing';
    end if;

    -- The caller's slug, and numbered alternatives only when another save took it
    -- between the client's check and this insert. Ten attempts is far more than a
    -- collision needs; past that something else is wrong and the caller should
    -- see the real error.
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
  -- Replaced wholesale, as the client did, and only with words the vocabulary
  -- already knows.
  delete from public.post_tags where post_id = v_id;
  insert into public.post_tags (post_id, tag_slug)
  select v_id, tg.slug
    from public.tags tg
   where tg.slug = any (
     select btrim(w)
       from unnest(coalesce(p_tags, '{}'::text[])) as w
      where char_length(btrim(w)) >= 2
   )
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
  -- `null` means "leave the poll alone", `[]` means "there is no poll", and a
  -- list replaces the options only when it differs from what is stored.
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

-- ---------------------------------------------------------------------------
-- A moderator is not a stranger.
--
-- `comments_delete_own` has always let a post's author remove a comment from
-- their own thread ("The post author may remove a comment from their own
-- thread; so may staff"). Deleting stopped being one statement when the thirty
-- day recovery window arrived: a delete is now an UPDATE of `deleted_at`, and
-- the update policy knew only the comment's own author and staff. The result
-- was a control that offered itself and then did nothing, because an update
-- that matches no row is a success with nothing written.
--
-- The second half of the same promise was missing too. A comment row in the
-- trash is private: only its author may read it. A post's author who hides
-- somebody else's comment on that post therefore could not read back what they
-- had hidden, and Postgres refuses an update whose new row the writer may not
-- see — "new row violates row-level security policy" — so the write failed
-- outright rather than doing nothing.
--
-- Both halves are fixed here, in the same three conditions as the delete
-- policy the product already documented: the comment's own author, staff, or
-- the author of the post the comment hangs on. The trash listing is widened to
-- match, and says which rows the member was looking after rather than wrote.
--
-- Every statement is a full replacement, so this file is safe to apply twice.
-- ---------------------------------------------------------------------------

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments
  for update
  using (
    author_uid = bsdc.current_uid()
    or bsdc.is_staff()
    or exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.author_uid = bsdc.current_uid()
    )
  )
  with check (
    author_uid = bsdc.current_uid()
    or bsdc.is_staff()
    or exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.author_uid = bsdc.current_uid()
    )
  );

comment on policy comments_update_own on public.comments is
  'The comment author, staff, or the post author may edit or soft-delete a comment on that post.';

-- The read policy keeps its shape: a visible comment belongs to a readable
-- post, a trashed comment belongs to its author — and now also to the member
-- who owns the post the comment hangs on, who is the one who can put it back.
drop policy if exists comments_read_visible on public.comments;
create policy comments_read_visible on public.comments
  for select using (
    status <> 'removed'
    and (
      (
        deleted_at is null
        and exists (
          select 1 from public.posts p
          where p.id = post_id
            and p.status <> 'removed'
            and p.deleted_at is null
            and bsdc.can_read_post(p.author_uid, p.status, p.visibility)
        )
      )
      or (
        deleted_at is not null
        and (
          author_uid = bsdc.current_uid()
          or exists (
            select 1 from public.posts p
            where p.id = post_id
              and p.author_uid = bsdc.current_uid()
          )
        )
      )
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_uid = bsdc.current_uid() and b.blocked_uid = author_uid)
         or (b.blocker_uid = author_uid and b.blocked_uid = bsdc.current_uid())
    )
  );

-- ---------------------------------------------------------------------------
-- The trash says how a row got there.
--
-- `moderated` is true when the row is somebody else's and the member is
-- reading it because they own the post. The trash screen uses it to say so
-- instead of showing a comment the member does not remember writing.
-- ---------------------------------------------------------------------------

-- The shape of a table function's result is not something `create or replace`
-- may change, so the old signature goes first.
drop function if exists public.my_deleted_content(integer);

create or replace function public.my_deleted_content(p_limit integer default 50)
returns table (
  kind        text,
  id          uuid,
  post_id     uuid,
  title       text,
  preview     text,
  deleted_at  timestamptz,
  expires_at  timestamptz,
  restorable  boolean,
  moderated   boolean
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  with me as (select bsdc.current_uid() as uid)
  select
    'post'::text,
    p.id,
    p.id,
    coalesce(nullif(p.title, ''), left(p.body, 80)),
    left(p.body, 200),
    p.deleted_at,
    p.deleted_at + interval '30 days',
    p.deleted_at > now() - interval '30 days',
    false
  from public.posts p, me
  where p.deleted_at is not null and p.author_uid = me.uid
  union all
  select
    'comment'::text,
    c.id,
    c.post_id,
    coalesce(nullif(parent.title, ''), left(parent.body, 80)),
    left(c.body, 200),
    c.deleted_at,
    c.deleted_at + interval '30 days',
    c.deleted_at > now() - interval '30 days',
    c.author_uid <> me.uid
  from public.comments c
  join public.posts parent on parent.id = c.post_id
  cross join me
  where c.deleted_at is not null
    and (c.author_uid = me.uid or parent.author_uid = me.uid)
  order by deleted_at desc
  limit greatest(1, least(p_limit, 200));
$$;

grant execute on function public.my_deleted_content(integer) to authenticated;

comment on function public.my_deleted_content(integer) is
  'The rows the caller deleted, plus the comments they hid on their own posts; `moderated` distinguishes the two.';

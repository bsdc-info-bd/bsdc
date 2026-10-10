-- ---------------------------------------------------------------------------
-- A project can be corrected, removed, and shown with more than one picture.
--
-- Report: "The project showing system are also not very good, the project not
-- have a separate page and not working, no cover image upload system, no multi
-- step project post system."
--
-- Migration 0063 gave a project a permalink and put it in the sitemap. The
-- publishing flow became four steps and the cover became an upload. What was
-- still missing was everything that happens after publish.
--
-- `public.projects` has carried an owner-update and an owner-delete policy
-- since 0014, and `authenticated` has held the matching table grants since the
-- same file. So an owner was always allowed to correct a typo in a repository
-- URL, replace a cover, or take a project down — the database permitted it and
-- no screen anywhere offered it. A published project was write-once in
-- practice, which is not what a showcase is for: the first thing an author does
-- after sharing a project is notice the thing they got wrong.
--
-- The second gap was the picture. A project stored exactly one `cover_url` and
-- nothing else, so a member could show a card and never the product. Posts
-- solved this in 0003 with `post_media`, a join onto `media_assets` that keeps
-- an order and an alt text per picture; this file gives projects the same
-- arrangement, named `project_media`, with the same shape and the same rule
-- that the bytes live at the external host and only the reference lives here.
--
--   project_media    screenshots, ordered, each with its own alt text
--   RLS              anybody may read; only the owner may write; staff may
--                    delete, matching how every other owned row behaves here
--   grants           select to anon and authenticated, insert and delete to
--                    authenticated, and the explicit column revoke that keeps
--                    `position` and `alt_text` writable while the counter
--                    columns stay server-owned
--
-- Nothing here touches `cover_url`. The cover remains its own column because
-- the sitemap, the OpenGraph image and the directory card all read it
-- directly; the screenshots are the gallery underneath it, not a replacement.
--
-- Idempotent: every statement is guarded, so re-applying this file is a no-op
-- rather than an error, which is what `scripts/db-push.mjs --verify` asserts.
-- ---------------------------------------------------------------------------

create table if not exists public.project_media (
  project_id uuid    not null references public.projects (id) on delete cascade,
  media_id   uuid    not null references public.media_assets (id) on delete cascade,
  "position" integer not null default 0 check ("position" >= 0),
  alt_text   text    not null default '' check (char_length(alt_text) <= 280),
  primary key (project_id, media_id)
);

-- A project with nine screenshots is read as one row per project, so the join
-- is driven from the project. This is the same index shape post_media relies on.
create index if not exists project_media_project_idx
  on public.project_media (project_id, "position");

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.project_media enable row level security;

drop policy if exists project_media_read_all on public.project_media;
create policy project_media_read_all on public.project_media
  for select using (true);

-- Ownership is decided by the project, never by the caller's claim about the
-- row: a member writes into their own project's gallery and nobody else's.
drop policy if exists project_media_write_owner on public.project_media;
create policy project_media_write_owner on public.project_media
  for all
  using (
    bsdc.is_staff()
    or exists (
      select 1 from public.projects p
      where p.id = project_media.project_id and p.owner_uid = bsdc.current_uid()
    )
  )
  with check (
    bsdc.is_staff()
    or exists (
      select 1 from public.projects p
      where p.id = project_media.project_id and p.owner_uid = bsdc.current_uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on public.project_media to anon, authenticated;
grant insert, delete on public.project_media to authenticated;

-- Update follows the shape 0042 established for every other owned table, and
-- for the reason 0042 was written: a table-level GRANT covers every column and
-- a column-level REVOKE cannot subtract from it. Granting `update` on the table
-- and then revoking the two foreign keys would have protected nothing at all —
-- a member could have repointed `media_id` at somebody else's upload or moved a
-- row into a project they do not own with one PostgREST PATCH.
--
-- So the table-level privilege is never granted here: only the order and the
-- caption are writable, which is all a reorder or a re-caption needs. A
-- reorder of the gallery deletes and reinserts, which is what the application
-- does anyway.
grant update ("position", alt_text) on public.project_media to authenticated;

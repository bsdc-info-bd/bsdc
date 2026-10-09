-- ---------------------------------------------------------------------------
-- A picture needs somewhere to live that this platform owns.
--
-- Report: "when I try to attach an image in the post nothing happens… there
-- are no image attach system, no image preview."
--
-- The composer had an attach button, and behind it a pipeline that sent every
-- post image to imgbb and every avatar, cover, document and voice note to
-- Cloudinary. Both are third parties whose keys are compiled into the public
-- bundle, and a deployment without them answers "Uploads are not configured" —
-- which on a phone, where the toast is easy to miss, looks exactly like
-- nothing happening at all.
--
-- Supabase Storage is the one place media can go that is already configured:
-- it is the same project the database lives in, it needs no new key in the
-- bundle, and it serves the bytes back over the same URL the rest of the data
-- arrives by. This migration makes it a first-party provider, so the third
-- parties become an optimisation rather than a requirement.
--
--   bsdc_media_provider     gains 'supabase'
--   storage.buckets         a public bucket named `media`, twenty megabytes an
--                           object, and the mime types the composer, the
--                           messenger and the product forms actually send
--   storage.objects         four policies: anybody may read what is in the
--                           bucket, and only the member whose folder it is may
--                           write, move or delete inside it
--
-- The path convention is `<uid>/<purpose>/<yyyymm>/<id>.<ext>`, and the first
-- segment is what the write policies check, so a member cannot write into
-- anybody else's folder or delete what is not theirs. Reading `owner` instead
-- would depend on the Storage API having filled it in from a token it does not
-- issue; the path is ours either way.
--
-- Identity comes from `bsdc.current_uid()`, the same function every other
-- policy in this database uses, which is what lets a Firebase-signed token
-- reach Storage at all.
--
-- The bucket is created through a block that only names the columns this
-- deployment's storage schema actually has: Supabase has added columns to
-- `storage.buckets` over the years, and an INSERT that names one an older
-- project does not have would fail the migration on the one database it was
-- written for.
-- ---------------------------------------------------------------------------

-- A first-party provider. Adding an enum value cannot be undone, and it is not
-- used anywhere in this same migration: Postgres will not let a value be
-- inserted in the transaction that created it.
alter type bsdc_media_provider add value if not exists 'supabase';

-- ---------------------------------------------------------------------------
-- The storage schema, for the environments that do not have one.
--
-- Production Supabase has both tables already, so these are no-ops there and
-- the policies below bind to the real ones. They exist so that the shape this
-- migration promises can be proved against a database built from nothing —
-- which is what `npm run db:prove` does on every pull request.
-- ---------------------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id                   text primary key,
  name                 text not null unique,
  owner                text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  "public"             boolean default false,
  avif_autodetection   boolean default false,
  file_size_limit      bigint,
  allowed_mime_types   text[],
  owner_id             text
);

create table if not exists storage.objects (
  id                uuid primary key default gen_random_uuid(),
  bucket_id         text references storage.buckets (id),
  name              text,
  owner             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  last_accessed_at  timestamptz default now(),
  metadata          jsonb,
  version           text,
  owner_id          text,
  unique (bucket_id, name)
);

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select on storage.objects to anon, authenticated, service_role;
grant insert, update, delete on storage.objects to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The bucket.
-- ---------------------------------------------------------------------------
do $$
declare
  v_columns   text := 'id, name';
  v_values    text := $q$'media', 'media'$q$;
  v_set       text := '';
  v_limit     bigint := 20 * 1024 * 1024;
  v_mimes     text := $q$array['image/jpeg','image/png','image/webp','image/gif','image/avif',
        'audio/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav',
        'video/mp4','video/webm',
        'application/pdf','text/plain',
        'application/zip',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]$q$;
  v_has_limit boolean;
  v_has_mimes boolean;
  v_has_public boolean;
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'no storage.buckets here: the bucket is created when Storage is enabled';
    return;
  end if;

  select
    exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'storage' and c.table_name = 'buckets'
        and c.column_name = 'file_size_limit'
    ),
    exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'storage' and c.table_name = 'buckets'
        and c.column_name = 'allowed_mime_types'
    ),
    exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'storage' and c.table_name = 'buckets'
        and c.column_name = 'public'
    )
  into v_has_limit, v_has_mimes, v_has_public;

  if v_has_limit then
    v_columns := v_columns || ', file_size_limit';
    v_values  := v_values  || ', ' || v_limit::text;
    v_set     := v_set || format('file_size_limit = %s, ', v_limit);
  end if;
  if v_has_mimes then
    v_columns := v_columns || ', allowed_mime_types';
    v_values  := v_values  || ', ' || v_mimes;
    v_set     := v_set || 'allowed_mime_types = ' || v_mimes || ', ';
  end if;
  if v_has_public then
    v_columns := v_columns || ', "public"';
    v_values  := v_values  || ', true';
    v_set     := v_set || '"public" = true, ';
  end if;

  -- The bucket itself is not optional: if this fails, the migration fails.
  execute format(
    'insert into storage.buckets (%s) values (%s) on conflict (id) do nothing',
    v_columns, v_values
  );

  -- A bucket that was already there keeps its identity and is brought to these
  -- limits: twenty megabytes is above every image the composer accepts and
  -- below the size that turns a phone upload into a liability. Only this part
  -- is allowed to differ between deployments, so only this part is guarded.
  if v_set <> '' then
    begin
      execute format(
        'update storage.buckets set %s where id = %L',
        rtrim(v_set, ', '), 'media'
      );
    exception
      when others then
        raise notice 'bucket limits left at their defaults: %', sqlerrm;
    end;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may do what inside it.
-- ---------------------------------------------------------------------------
alter table storage.objects enable row level security;

drop policy if exists "bsdc media is readable by anybody" on storage.objects;
create policy "bsdc media is readable by anybody" on storage.objects
  for select
  using (bucket_id = 'media');

drop policy if exists "bsdc media is written in your own folder" on storage.objects;
create policy "bsdc media is written in your own folder" on storage.objects
  for insert
  with check (
    bucket_id = 'media'
    and bsdc.current_uid() is not null
    and split_part(coalesce(name, ''), '/', 1) = bsdc.current_uid()
  );

drop policy if exists "bsdc media is moved in your own folder" on storage.objects;
create policy "bsdc media is moved in your own folder" on storage.objects
  for update
  using (
    bucket_id = 'media'
    and bsdc.current_uid() is not null
    and split_part(coalesce(name, ''), '/', 1) = bsdc.current_uid()
  )
  with check (
    bucket_id = 'media'
    and bsdc.current_uid() is not null
    and split_part(coalesce(name, ''), '/', 1) = bsdc.current_uid()
  );

drop policy if exists "bsdc media is deleted by its owner" on storage.objects;
create policy "bsdc media is deleted by its owner" on storage.objects
  for delete
  using (
    bucket_id = 'media'
    and bsdc.current_uid() is not null
    and split_part(coalesce(name, ''), '/', 1) = bsdc.current_uid()
  );

-- Staff reach every object: a moderator removing a picture that was reported
-- is not the member whose folder it lives in.
drop policy if exists "bsdc media is reachable by staff" on storage.objects;
create policy "bsdc media is reachable by staff" on storage.objects
  for all
  using (bsdc.is_staff())
  with check (bsdc.is_staff());

comment on policy "bsdc media is written in your own folder" on storage.objects is
  'The first path segment is the member''s uid, which is what makes the folder theirs.';

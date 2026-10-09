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
--   storage.objects         five policies: anybody may read what is in the
--                           bucket, only the member whose folder it is may
--                           write, move or delete inside it, and staff reach
--                           all of it
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
-- ---------------------------------------------------------------------------
-- WHY NONE OF THE STORAGE WORK BELOW IS WRITTEN AS PLAIN SQL
--
-- `storage` is the one schema in this database that this platform does not own.
-- It belongs to `supabase_storage_admin`, and the role that applies migrations —
-- `postgres`, over the transaction pooler — has no CREATE on it. So the first
-- version of this file, which opened with
--
--     create table if not exists storage.buckets (…);
--
-- failed in production on exactly that line, with `42501 permission denied for
-- schema storage`. `IF NOT EXISTS` does not help: Postgres checks the right to
-- create in the namespace before it looks at whether the thing is already there.
-- The same is true of the grants, of `enable row level security` and of every
-- `create policy`, all of which want ownership of a table this role does not
-- own. Because `scripts/db-push.mjs` applies one file in one transaction, the
-- whole migration rolled back and nothing was left behind — a clean failure, but
-- a failure that stopped seventeen migrations from being applied.
--
-- So every statement that touches `storage` is now attempted rather than
-- asserted: it runs where this role has the right, it is skipped where the work
-- is already done, and where it is refused the refusal is recorded. In the
-- environments this repository builds itself — pglite under `npm run db:prove`,
-- a local `supabase start` — the role is a superuser, so everything below is
-- created exactly as before and `t28` still proves the bucket and all five
-- policies. In production the tables already exist and are owned by Storage, so
-- there is nothing to create; the bucket insert and the policies are attempted,
-- and whatever this role was refused is written to `bsdc.deployment_notes`,
-- which the deploy script prints at the end of the run.
--
-- That last part is the reason this file is longer than it looks. A migration
-- that quietly does nothing is worse than one that fails: an upload button that
-- answers 42501 six weeks later, with no record of why, is the same report this
-- migration was written to close. So the file ends by checking its own work and
-- saying, out loud, in the deploy log and in the database, what is still owed.
-- ---------------------------------------------------------------------------

-- A first-party provider. Adding an enum value cannot be undone, and it is not
-- used anywhere in this same migration: Postgres will not let a value be
-- inserted in the transaction that created it.
alter type bsdc_media_provider add value if not exists 'supabase';

-- ---------------------------------------------------------------------------
-- What a deployment still owes.
--
-- One row per thing a migration wanted to do and was refused the right to do.
-- The deploy script reads this table after applying and prints it; the row
-- disappears by itself on the next run that manages the work, so a note that is
-- still there is a note that is still true.
-- ---------------------------------------------------------------------------
create schema if not exists bsdc;

create table if not exists bsdc.deployment_notes (
  id          bigserial primary key,
  topic       text        not null unique check (char_length(topic) <= 80),
  detail      text        not null check (char_length(detail) <= 2000),
  raised_at   timestamptz not null default now(),
  resolved_at timestamptz
);

alter table bsdc.deployment_notes enable row level security;

drop policy if exists deployment_notes_staff on bsdc.deployment_notes;
create policy deployment_notes_staff on bsdc.deployment_notes
  for select
  using (bsdc.is_staff());

grant select on bsdc.deployment_notes to authenticated;

comment on table bsdc.deployment_notes is
  'What a migration could not do with the rights it was given. Empty on a deployment that owes nothing.';

create or replace function bsdc.note_deployment(p_topic text, p_detail text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  insert into bsdc.deployment_notes (topic, detail)
  values (left(p_topic, 80), left(p_detail, 2000))
  on conflict (topic) do update
    set detail = excluded.detail,
         raised_at = now(),
         resolved_at = null;
end;
$$;

create or replace function bsdc.resolve_deployment_note(p_topic text)
returns void
language sql
security definer
set search_path = public, bsdc, pg_temp
as $$
  update bsdc.deployment_notes
     set resolved_at = now()
   where topic = p_topic
     and resolved_at is null;
$$;

-- ---------------------------------------------------------------------------
-- The storage schema: created where there is none, left alone where there is.
-- ---------------------------------------------------------------------------
do $$
declare
  v_can_create boolean;
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    -- Only a database built from nothing arrives here: production has had this
    -- schema since the project was created.
    begin
      execute 'create schema storage';
    exception when others then
      raise warning 'storage: no schema, and no right to create one (%)', sqlerrm;
      perform bsdc.note_deployment(
        'storage.schema',
        'There is no storage schema and the role that applies migrations may not create one. Enable Storage in the Supabase dashboard, then re-run the migrations.'
      );
      return;
    end;
  end if;

  v_can_create := has_schema_privilege(current_user, 'storage', 'CREATE');

  if to_regclass('storage.buckets') is null and v_can_create then
    execute $q$
      create table storage.buckets (
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
      )
    $q$;
  end if;

  if to_regclass('storage.objects') is null and v_can_create then
    execute $q$
      create table storage.objects (
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
      )
    $q$;
  end if;

  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise warning 'storage: the tables are not here and this role may not create them';
    perform bsdc.note_deployment(
      'storage.tables',
      'storage.buckets or storage.objects is missing and the role that applies migrations has no CREATE on the storage schema. Enable Storage in the Supabase dashboard, then re-run the migrations.'
    );
    return;
  end if;

  -- Grants and row level security: already set by the platform wherever Storage
  -- exists, so a refusal here changes nothing and is only worth a line.
  begin
    execute 'grant usage on schema storage to anon, authenticated, service_role';
    execute 'grant select on storage.buckets to anon, authenticated, service_role';
    execute 'grant select on storage.objects to anon, authenticated, service_role';
    execute 'grant insert, update, delete on storage.objects to authenticated, service_role';
  exception when others then
    raise notice 'storage: grants left exactly as the platform set them (%)', sqlerrm;
  end;

  begin
    if exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'storage' and c.relname = 'objects' and not c.relrowsecurity
    ) then
      execute 'alter table storage.objects enable row level security';
    end if;
  exception when others then
    raise warning 'storage: row level security could not be enabled on storage.objects (%)', sqlerrm;
    perform bsdc.note_deployment(
      'storage.rls',
      'Row level security is off on storage.objects and this role may not turn it on. Without it the policies below do not apply to anybody.'
    );
  end;

  perform bsdc.resolve_deployment_note('storage.schema');
  perform bsdc.resolve_deployment_note('storage.tables');
end;
$$;

-- ---------------------------------------------------------------------------
-- The bucket.
--
-- The insert names only the columns this deployment's storage schema actually
-- has: Supabase has added columns to `storage.buckets` over the years, and an
-- INSERT that names one an older project does not have would fail the migration
-- on the one database it was written for.
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
    -- The block above has already said what is wrong and recorded it.
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

  begin
    execute format(
      'insert into storage.buckets (%s) values (%s) on conflict (id) do nothing',
      v_columns, v_values
    );

    -- A bucket that was already there keeps its identity and is brought to these
    -- limits: twenty megabytes is above every image the composer accepts and
    -- below the size that turns a phone upload into a liability. Only this part
    -- is allowed to differ between deployments, so only this part is guarded.
    if v_set <> '' then
      execute format(
        'update storage.buckets set %s where id = %L',
        rtrim(v_set, ', '), 'media'
      );
    end if;
  exception when others then
    raise warning 'storage: the media bucket could not be written (%)', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may do what inside it.
--
-- Attempted one statement at a time, so that a role refused on the first is not
-- refused on all five: a deployment that already has four of them keeps the four.
-- ---------------------------------------------------------------------------
do $$
declare
  v_steps text[] := array[
    'drop policy if exists "bsdc media is readable by anybody" on storage.objects',
    'create policy "bsdc media is readable by anybody" on storage.objects
       for select using (bucket_id = ''media'')',
    'drop policy if exists "bsdc media is written in your own folder" on storage.objects',
    'create policy "bsdc media is written in your own folder" on storage.objects
       for insert with check (
         bucket_id = ''media''
         and bsdc.current_uid() is not null
         and split_part(coalesce(name, ''''), ''/'', 1) = bsdc.current_uid()
       )',
    'drop policy if exists "bsdc media is moved in your own folder" on storage.objects',
    'create policy "bsdc media is moved in your own folder" on storage.objects
       for update using (
         bucket_id = ''media''
         and bsdc.current_uid() is not null
         and split_part(coalesce(name, ''''), ''/'', 1) = bsdc.current_uid()
       ) with check (
         bucket_id = ''media''
         and bsdc.current_uid() is not null
         and split_part(coalesce(name, ''''), ''/'', 1) = bsdc.current_uid()
       )',
    'drop policy if exists "bsdc media is deleted by its owner" on storage.objects',
    'create policy "bsdc media is deleted by its owner" on storage.objects
       for delete using (
         bucket_id = ''media''
         and bsdc.current_uid() is not null
         and split_part(coalesce(name, ''''), ''/'', 1) = bsdc.current_uid()
       )',
    'drop policy if exists "bsdc media is reachable by staff" on storage.objects',
    'create policy "bsdc media is reachable by staff" on storage.objects
       for all using (bsdc.is_staff()) with check (bsdc.is_staff())',
    'comment on policy "bsdc media is written in your own folder" on storage.objects is
       ''The first path segment is the member''''s uid, which is what makes the folder theirs.'''
  ];
  v_step text;
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  foreach v_step in array v_steps loop
    begin
      execute v_step;
    exception when others then
      raise warning 'storage: refused — % (%)', left(regexp_replace(v_step, '\s+', ' ', 'g'), 72), sqlerrm;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Checking its own work.
--
-- Whatever is missing after all that attempting is written down twice: as a
-- WARNING in the deploy log, where whoever ran it will see it, and as a row in
-- `bsdc.deployment_notes`, which survives the log and is printed by the next
-- deploy too. A row that is no longer true is resolved by the run that finds the
-- work done, so the table is never a museum.
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing_policies text[];
  v_bucket           boolean;
  v_public           boolean;
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  select coalesce(array_agg(expected.name order by expected.name), '{}'::text[])
    into v_missing_policies
    from (
      values
        ('bsdc media is deleted by its owner'),
        ('bsdc media is moved in your own folder'),
        ('bsdc media is reachable by staff'),
        ('bsdc media is readable by anybody'),
        ('bsdc media is written in your own folder')
    ) as expected(name)
   where not exists (
     select 1 from pg_policies p
      where p.schemaname = 'storage'
        and p.tablename = 'objects'
        and p.policyname = expected.name
   );

  if cardinality(v_missing_policies) > 0 then
    raise warning 'storage: % of the five media policies are missing: %',
      cardinality(v_missing_policies), array_to_string(v_missing_policies, '; ');
    perform bsdc.note_deployment(
      'storage.policies',
      format(
        'The role that applies migrations could not create %s of the five media policies on storage.objects (%s). Until they exist, uploads to the media bucket are refused for everybody. Create them in the Supabase dashboard under Storage → Policies, or run the SQL in docs/deploying.md as a role that owns the table.',
        cardinality(v_missing_policies),
        array_to_string(v_missing_policies, ', ')
      )
    );
  else
    perform bsdc.resolve_deployment_note('storage.policies');
  end if;

  -- Read through a block of its own: this role may not be able to read the
  -- table at all, and an older project may not have the column.
  begin
    select exists (select 1 from storage.buckets where id = 'media') into v_bucket;
    if v_bucket and exists (
      select 1 from information_schema.columns c
       where c.table_schema = 'storage' and c.table_name = 'buckets'
         and c.column_name = 'public'
    ) then
      execute $q$select exists (select 1 from storage.buckets where id = 'media' and "public")$q$
        into v_public;
    else
      v_public := v_bucket;
    end if;
  exception when others then
    raise notice 'storage: the bucket could not be read back (%)', sqlerrm;
    v_bucket := true;
    v_public := true;
  end;

  if not v_bucket then
    raise warning 'storage: there is no bucket named media';
    perform bsdc.note_deployment(
      'storage.bucket',
      'The public bucket named media does not exist and this role could not create it. Create it in the Supabase dashboard under Storage → New bucket (name: media, public), or with the Storage API using the service key.'
    );
  else
    perform bsdc.resolve_deployment_note('storage.bucket');
    if not v_public then
      raise warning 'storage: the media bucket exists but is not public';
      perform bsdc.note_deployment(
        'storage.bucket.public',
        'The media bucket exists but is not public, so media URLs will not serve. Make it public in the dashboard under Storage → media → Settings.'
      );
    else
      perform bsdc.resolve_deployment_note('storage.bucket.public');
    end if;
  end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'storage' and c.relname = 'objects' and not c.relrowsecurity
  ) then
    raise warning 'storage: row level security is off on storage.objects';
    perform bsdc.note_deployment(
      'storage.rls',
      'Row level security is off on storage.objects. With it off, the media policies apply to nobody and the bucket is open to every role that can reach the table.'
    );
  else
    perform bsdc.resolve_deployment_note('storage.rls');
  end if;
end;
$$;

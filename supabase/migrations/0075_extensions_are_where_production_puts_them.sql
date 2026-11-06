-- ---------------------------------------------------------------------------
-- Extensions are where production puts them.
--
-- The report was exact and the cause was one line deep:
--
--     function gen_random_bytes(integer) does not exist
--     ... issued_certificates.code ... "The certificate was not issued"
--
-- Nothing was wrong with the certificate code. Every migration proved green
-- before it shipped, because the harness builds its database with PGlite,
-- which installs `pgcrypto` into `public`. Supabase installs it into
-- `extensions`, and `extensions` is not in the search path of a function that
-- pins one. So on the harness the call resolved and on production it did not,
-- and the difference was never visible from here.
--
-- That is a class of bug, not an instance: `citext` and `pg_trgm` are
-- installed the same way, and this schema pins a search path on every
-- security-definer function on purpose. Fifty migrations later the mistake is
-- one pinned path away from the next outage.
--
-- What this migration does:
--
--   1. Adds `extensions` to the pinned search path of every function in
--      `public` and `bsdc`, in the schema itself, so the next function that
--      needs an extension resolves it wherever the extension lives. A schema
--      that has no `extensions` is untouched — an unset schema on a search
--      path costs nothing and resolves nothing, so the file is safe to replay
--      against a layout that never created one.
--   2. Makes `pgcrypto` and `pg_trgm` reachable by name from the session that
--      applies migrations, so the migration files themselves can be replayed
--      on a database whose extensions live in `extensions`. A database whose
--      extensions are already in `public` gets a no-op.
--   3. Replaces the two functions whose generation of a printed code depended
--      on an unqualified `gen_random_bytes`, and states the code format once.
--   4. Records what it found in `bsdc.deployment_notes`, because a deployment
--      that had this bug should be able to say so afterwards.
--
-- The harness that proves it — `t48.mjs` — drops `public` from the extension
-- resolution entirely and replays every migration with the extensions in
-- `extensions`, then issues a certificate, a notice and a staff card. The
-- mistake cannot come back silently: the proof builds the database
-- production builds.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Every extension this schema calls, where production actually puts it
-- ---------------------------------------------------------------------------
-- Supabase runs `create extension "pgcrypto" with schema extensions` in its
-- own bootstrap, which is exactly the layout this schema could not see. The
-- block below reproduces that layout wherever it has not been reproduced —
-- with `alter extension ... set schema`, which is the operation production
-- already performed — so that the database this repository is tested against
-- and the database a customer signs in to are the same shape.
--
-- A hosting provider that manages the extension itself will refuse the move.
-- That is recorded in `bsdc.deployment_notes`, never raised: a migration must
-- not stop applying because an extension is already where it is going to stay,
-- and every search path below names `extensions` whether the move succeeded or
-- not.
do $$
declare
  v_moved text[] := '{}';
  v_kept  text[] := '{}';
  v_extension text;
begin
  if to_regnamespace('extensions') is null then
    -- Supabase creates this schema in its own bootstrap; a bare Postgres does
    -- not. Creating it is harmless where it exists and necessary where it does
    -- not, because everything below is about where extensions live.
    execute 'create schema if not exists extensions';
  end if;

  grant usage on schema extensions to anon, authenticated, service_role;

  foreach v_extension in array array['pgcrypto', 'citext', 'pg_trgm', 'unaccent'] loop
    if exists (select 1 from pg_extension where extname = v_extension) then
      begin
        execute format('alter extension %I set schema extensions', v_extension);
        v_moved := v_moved || v_extension;
      exception when others then
        -- A hosting provider that manages the extension itself will refuse
        -- this, and it is already where it is going to stay. The search paths
        -- below name `extensions` regardless, so nothing downstream depends on
        -- the outcome — this is recorded, never raised.
        v_kept := v_kept || v_extension;
      end;
    end if;
  end loop;

  perform bsdc.note_deployment(
    'extension-layout',
    format(
      'Extensions resolve from %%s. Supabase installs them into `extensions`; '
      'PGlite installs them into `public`. Every pinned search path in this '
      'schema names both, so the two layouts behave the same.',
      coalesce((
        select string_agg(e.extname || ' -> ' || n.nspname, ', ' order by e.extname)
        from pg_extension e join pg_namespace n on n.oid = e.extnamespace
        where e.extname in ('pgcrypto', 'citext', 'pg_trgm', 'unaccent')
      ), 'nothing')));

  -- A note that is still open should mean something is still wrong, so the
  -- layout note closes itself the moment the layout is the one production has.
  if cardinality(v_kept) = 0 then
    perform bsdc.resolve_deployment_note('extension-layout');
  end if;
end;
$$;

-- The apply session needs the same reach, because the migration files below
-- `public` were written against a search path that had the extensions in it.
-- `set search_path` here is scoped to this migration's transaction by
-- `db-push.mjs`, which runs each file in one; on the Supabase CLI it lasts for
-- the session that applies the rest of the run, which is the intent.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 2. The pinned search paths, now complete
-- ---------------------------------------------------------------------------
-- `pg_temp` stays last, always: it is the only entry a caller can populate,
-- and a function that pins a path is protecting itself from exactly that.
-- `extensions` goes immediately before it, so a caller-supplied schema is
-- never consulted before the real one.
do $$
declare
  v_function record;
  v_config text[];
  v_path text;
  v_change record;
begin
  if to_regnamespace('extensions') is null then
    return;
  end if;

  for v_function in
    select p.oid, n.nspname, p.proname, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'bsdc')
      and p.proconfig is not null
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  loop
    select string_agg(c, '' order by ord)
      into v_config
      from unnest(v_function.proconfig) with ordinality as t(c, ord)
     where c not like 'search_path=%';

    select substr(c, 13) into v_path
      from unnest(v_function.proconfig) c
     where c like 'search_path=%';

    if v_path ~ '(^|,)\s*extensions\s*(,|$)' then
      continue;
    end if;

    -- `pg_temp` is dropped and re-added so it is always last, even on a
    -- function that was written with it in the middle.
    v_path := regexp_replace(v_path, '\s*,?\s*pg_temp\s*', '', 'g');
    v_path := btrim(v_path) || ', extensions, pg_temp';

    execute format(
      'alter function %I.%I(%s) set search_path = %s',
      v_function.nspname,
      v_function.proname,
      pg_get_function_identity_arguments(v_function.oid),
      v_path);

    -- `alter function ... set` replaces the whole proconfig for the function,
    -- so anything else the function pinned — a timezone, a statement timeout
    -- — is put back exactly as it was.
    if v_config is not null then
      for v_change in select unnest(v_config) as setting loop
        execute format(
          'alter function %I.%I(%s) set %s = %L',
          v_function.nspname,
          v_function.proname,
          pg_get_function_identity_arguments(v_function.oid),
          split_part(v_change.setting, '=', 1),
          substr(v_change.setting, strpos(v_change.setting, '=') + 1));
      end loop;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The two functions whose output depended on the unqualified call
-- ---------------------------------------------------------------------------
-- `bsdc.issue_doc_code` is defined by `0030`. This is the same function with
-- the extension schema named and one change to what it prints: the eight
-- characters are drawn from an alphabet that cannot be misread, thirty-two
-- letters wide, instead of from the sixteen hex digits of eight random bytes.
--
--   * Before: sixteen possible characters per position, two of which (`O`,
--     `I`) were then repaired into `8` and `4`, and four of which (`S`, `V`
--     and the rest) read as digits or words. 32 bits of entropy in 8 chars.
--   * After: thirty-two possible characters per position, none of them
--     confusable with another. 40 bits of entropy in 8 chars, and a code that
--     survives being read down a telephone.
--
-- `issued_certificates.code`, `notices.code` and `staff_records.card_code` all
-- accept `[0-9A-Z]{8}`, so the new alphabet is already legal in all three and
-- every code already in issue stays valid: this changes what is minted from
-- here on, not what was minted before.
create or replace function bsdc.issue_doc_code(p_kind text)
returns text
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  -- Crockford's base-32 alphabet, minus the letters a reader types back as a
  -- digit: no I or L (both read as 1), no O (reads as 0), no U (a typo for
  -- V). Nothing needs repairing, because nothing confusable is ever printed.
  c_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_body text := '';
begin
  if p_kind !~ '^[A-Z]{2}$' then
    raise exception 'A document kind is two capital letters' using errcode = '22023';
  end if;

  -- Eight characters, five bits each, forty bits of entropy. A byte reduced
  -- to its low five bits is still uniform, so no character is likelier than
  -- another and no platform's shift arithmetic is trusted to agree.
  for i in 1..8 loop
    v_body := v_body || substr(
      c_alphabet,
      (get_byte(extensions.gen_random_bytes(1), 0) & 31) + 1,
      1);
  end loop;

  return 'BSDC-' || p_kind || '-' || v_body || '-' || bsdc.card_check_digit(v_body)::text;
end;
$$;

-- The staff card drew its own bytes in `0028`, with the same call and the same
-- weakness. It now asks the same generator every other printed code asks, so
-- one alphabet and one check digit cover the whole ecosystem — which is what
-- `verify_code` in `0030` already assumes when it repairs `O` and `I` for any
-- kind of document.
create or replace function public.issue_staff_card(p_uid text)
returns text
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_code text;
  v_try  integer := 0;
begin
  perform bsdc.require_permission('people.role');

  if not exists (select 1 from public.staff_records where uid = p_uid and is_active) then
    raise exception 'No active staff record for that member' using errcode = 'P0002';
  end if;

  loop
    v_try := v_try + 1;
    v_code := bsdc.issue_doc_code('ID');
    exit when not exists (select 1 from public.staff_records where card_code = v_code);
    if v_try > 10 then
      raise exception 'Could not allocate a card code' using errcode = '55000';
    end if;
  end loop;

  update public.staff_records
  set card_code = v_code, card_issued_at = now()
  where uid = p_uid;

  perform bsdc.audit('staff.card', p_uid, jsonb_build_object('code', v_code));
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The checker that never fails, so a caller never has to be trusted
-- ---------------------------------------------------------------------------
-- `issue_certificate` retries a code until the table says it is unused, which
-- is correct and was never the problem. It failed because the generator threw
-- before it could return anything. This is the belt to that braces: a
-- generator that cannot throw, so a certificate fails only for a reason the
-- operator can act on.
create or replace function bsdc.doc_code_available(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select not exists (select 1 from public.issued_certificates where code = p_code)
     and not exists (select 1 from public.notices where code = p_code)
     and not exists (select 1 from public.staff_records where card_code = p_code);
$$;

grant execute on function bsdc.doc_code_available(text) to authenticated;

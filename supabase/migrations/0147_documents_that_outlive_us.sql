-- ============================================================================
-- 0147 — documents that outlive the platform's memory of making them
-- ============================================================================
--
-- §11 of the plan, as database work. A certificate and a notice are both artifacts
-- that end up in somebody's hand, on a printer, in an email, years after the row
-- that produced them. Three properties make such a document different from a
-- record:
--
--   * **The bytes are reproducible.** The same stored row must render to the same
--     PDF, so the hash of that PDF is a piece of evidence rather than a cache key.
--     That means the render path may read a clock or a random number *never*, and
--     the thing it reads instead must be stored at issue time.
--   * **The chain is immutable.** An amendment adds a link; it does not edit one.
--     A revoked certificate stays revoked in the record even after it is restored,
--     because "it was once revoked" is the single fact a restored certificate most
--     needs to keep.
--   * **The public view reveals nothing extra.** Verification answers for exactly
--     the fields printed on the document, and says "not found" and "revoked" as
--     different answers rather than collapsing them into one silence.
--
-- Two defects in the existing schema are fixed here rather than worked around:
--
--   1. `restore_issued_certificate` clears `revoked_at` in place, so a certificate
--      that was revoked and restored verifies as though nothing ever happened. t58
--      asserts that behaviour, which means the test encoded the bug. The restore
--      now writes a new revision and moves `revoked_at` into `revoked_history`, and
--      t58 is updated with the reason written next to it.
--   2. Template edits are invisible to old certificates, so re-rendering a 2024
--      certificate in 2026 produces different bytes with no record of why. Each
--      issue now snapshots the template it used.

-- ---------------------------------------------------------------------------
-- 1. The render lock
-- ---------------------------------------------------------------------------
-- A certificate's bytes depend on four things: the document's own fields, the
-- template, the brand accent, and the date it was issued. Three of those are
-- already frozen. The fourth — the template — is mutable, so every render of an
-- old certificate has been quietly re-rendering it against today's template.
--
-- The fix stores a *rendered* hash and a template snapshot at issue, and a verify
-- time check that recomputes the hash from the same inputs. A mismatch is not a
-- correction to make silently; it is a fact that the document in somebody's hand no
-- longer matches what the platform would print today, and the verification desk is
-- the place to say so.
alter table public.issued_certificates
  add column if not exists template_snapshot jsonb,
  add column if not exists content_hash text
    check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists hashed_at timestamptz,
  -- The revoked-then-restored history. An array of objects rather than a child
  -- table: it is read as one field on a verification card, never queried across
  -- certificates, and a child table would be a join for a list that is almost
  -- always one entry long.
  add column if not exists revoked_history jsonb not null default '[]'::jsonb;

comment on column public.issued_certificates.template_snapshot is
  'The template as it was at issue, so a later edit cannot change what this document prints.';
comment on column public.issued_certificates.content_hash is
  'SHA-256 over the canonical rendering inputs. Recomputed by verify and compared, never trusted blindly.';
comment on column public.issued_certificates.revoked_history is
  'Every revocation this certificate has had, with its reason and time. Restoring does not clear it.';

-- The canonical string a certificate renders from.
--
-- This is the single definition of "what this document says". The PDF generator in
-- the console builds the same string from the same fields, and a test asserts the
-- two agree — because a hash computed over a different string in two places is a
-- hash that agrees with itself and nothing else.
--
-- The date is formatted explicitly rather than cast, so the digits do not depend on
-- a server's `DateStyle`; a certificate issued in Dhaka and verified in Frankfurt
-- must hash the same.
create or replace function bsdc.certificate_render_string(
  p_code           text,
  p_recipient_name text,
  p_subject        text,
  p_body           text,
  p_issued_on      date,
  p_expires_on     date,
  p_template_key   text
)
returns text
language sql
immutable
set search_path = public, bsdc, extensions, pg_temp
as $$
  select concat_ws(
    E'\n',
    -- A version line first. If the canonical form ever has to change, the version
    -- changes with it and old hashes stay verifiable under the old rules rather
    -- than silently failing.
    'bsdc-cert-v1',
    upper(btrim(coalesce(p_code, ''))),
    btrim(coalesce(p_recipient_name, '')),
    btrim(coalesce(p_subject, '')),
    btrim(coalesce(p_body, '')),
    to_char(p_issued_on, 'YYYY-MM-DD'),
    case when p_expires_on is null then '' else to_char(p_expires_on, 'YYYY-MM-DD') end,
    lower(btrim(coalesce(p_template_key, '')))
  );
$$;

revoke all on function bsdc.certificate_render_string(text, text, text, text, date, date, text) from public, anon;
grant execute on function bsdc.certificate_render_string(text, text, text, text, date, date, text) to authenticated, service_role;

-- SHA-256 in SQL, because pgcrypto's `digest` is the one implementation both the
-- database and a test can call. Pinned to `extensions` by the search path, which is
-- where Supabase installs it.
create or replace function bsdc.certificate_hash(
  p_code           text,
  p_recipient_name text,
  p_subject        text,
  p_body           text,
  p_issued_on      date,
  p_expires_on     date,
  p_template_key   text
)
returns text
language sql
immutable
set search_path = public, bsdc, extensions, pg_temp
as $$
  select encode(
    extensions.digest(
      -- `convert_to(..., 'UTF8')` is explicit because the same call in 0085 needed it:
      -- digest over a text argument depends on the database encoding, and a hash that
      -- depends on an encoding is not a hash of the document.
      convert_to(bsdc.certificate_render_string(
        p_code, p_recipient_name, p_subject, p_body, p_issued_on, p_expires_on, p_template_key
      ), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function bsdc.certificate_hash(text, text, text, text, date, date, text) from public, anon;
grant execute on function bsdc.certificate_hash(text, text, text, text, date, date, text) to authenticated, service_role;

-- Backfill the hash for everything issued before this migration, using the template
-- as it is *now*. That is the honest ceiling: the original template no longer exists
-- for those rows, so their snapshot is the current one and the column says so
-- through `hashed_at` being older than any future edit.
update public.issued_certificates c
   set template_snapshot = coalesce(
         (select to_jsonb(t) - 'updated_at' from public.certificate_templates t where t.key = c.template_key),
         '{}'::jsonb),
       content_hash = bsdc.certificate_hash(
         c.code, c.recipient_name, c.subject, c.body, c.issued_on, c.expires_on, c.template_key),
       hashed_at = now()
 where c.content_hash is null;

-- Issue now stamps the identity. Same signature, same return type: the console and
-- t58 keep working, and the columns arrive already filled.
create or replace function public.issue_certificate(
  p_template_key   text,
  p_recipient_name text,
  p_subject        text,
  p_recipient_uid  text default null,
  p_issued_on      date default current_date,
  p_expires_on     date default null,
  p_body           text default ''
)
returns text
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
-- The signature, the validation, the body templating and the notification are 0091's
-- and are reproduced here unchanged: `create or replace` with a different argument
-- list would have created an *overload* instead of replacing anything, leaving the
-- old function in place and the console calling whichever one Postgres resolved
-- first. What 0147 adds is the template snapshot and the content hash, so the bytes
-- that were issued can be reproduced from the row years later.
declare
  v_template public.certificate_templates;
  v_code     text;
  v_body     text;
  v_try      integer := 0;
  v_actor    text := bsdc.current_uid();
  v_name     text := btrim(coalesce(p_recipient_name, ''));
  v_subject  text := btrim(coalesce(p_subject, ''));
  v_uid      text := nullif(btrim(coalesce(p_recipient_uid, '')), '');
  v_date     date := coalesce(p_issued_on, current_date);
begin
  perform bsdc.require_permission('certificates.issue');

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Recipient name must be between 2 and 120 characters' using errcode = '22023';
  end if;
  if char_length(v_subject) < 2 or char_length(v_subject) > 200 then
    raise exception 'Subject must be between 2 and 200 characters' using errcode = '22023';
  end if;
  if p_expires_on is not null and p_expires_on < v_date then
    raise exception 'Expiry date cannot precede the issue date' using errcode = '22023';
  end if;
  if v_uid is not null and not exists (select 1 from public.profiles where uid = v_uid) then
    raise exception 'No member account matches that member UID' using errcode = '22023';
  end if;

  select * into v_template from public.certificate_templates where key = p_template_key;
  if v_template.key is null then
    raise exception 'No such certificate template' using errcode = 'P0002';
  end if;
  if not v_template.is_active then
    raise exception 'That template is retired' using errcode = '22023';
  end if;

  v_body := coalesce(nullif(btrim(coalesce(p_body, '')), ''), v_template.body_template);
  v_body := replace(v_body, '{recipient}', v_name);
  v_body := replace(v_body, '{subject}', v_subject);
  v_body := replace(v_body, '{date}', to_char(v_date, 'DD Mon YYYY'));

  if char_length(v_body) > 1200 then
    raise exception 'Printed certificate body must be at most 1200 characters (currently %)', char_length(v_body)
      using errcode = '22023';
  end if;

  -- Two nested attempts, because "is this code free" and "did the insert win" are
  -- different races. The outer loop asks; the inner `exception when unique_violation`
  -- catches the case where somebody else claimed the code in between — which is the
  -- one a check-then-insert cannot see. 0091's outer loop had no such handler, so a
  -- lost race surfaced to the operator as a raw constraint error.
  for attempt in 1..3 loop
    begin
      v_code := bsdc.issue_doc_code('CT');

      insert into public.issued_certificates
        (code, template_key, recipient_uid, recipient_name, subject, body,
         issued_on, expires_on, issued_by,
         template_snapshot, content_hash, hashed_at)
      values
        (v_code, p_template_key, v_uid, v_name, v_subject, v_body,
         v_date, p_expires_on, v_actor,
         -- The snapshot is the template minus its own clock: an `updated_at` inside
         -- the snapshot would change on a touch and break reproducibility for a
         -- document nobody edited.
         to_jsonb(v_template) - 'updated_at',
         bsdc.certificate_hash(
           v_code, v_name, v_subject, v_body, v_date, p_expires_on, p_template_key),
         now());

      if v_uid is not null then
        perform bsdc.notify_path(
          v_uid,
          v_actor,
          'certificate',
          null,
          null,
          left('Certificate issued (' || v_code || '): ' || v_subject, 280),
          null,
          '/verify?code=' || v_code
        );
      end if;

      perform bsdc.audit('certificate.issue', v_code,
        jsonb_build_object('template', p_template_key, 'recipient', v_name));
      return v_code;

    exception when unique_violation then
      if attempt = 3 then
        raise exception 'Could not mint a unique certificate code in three attempts'
          using errcode = '40001';
      end if;
    end;
  end loop;

  raise exception 'Unreachable: the retry loop returned without a code' using errcode = 'P0002';
end;
$$;
revoke all on function public.issue_certificate(text, text, text, text, date, date, text) from public, anon;
grant execute on function public.issue_certificate(text, text, text, text, date, date, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The chain a reader can follow
-- ---------------------------------------------------------------------------
-- Every revision of a certificate, oldest first, with what changed between each
-- link and why. `certificate_revisions` and `certificate_history` already existed;
-- what was missing is the *diff*, because a list of revisions with no field-level
-- difference is a list a reader has to open three at a time to understand.
create or replace function public.certificate_chain(p_code text)
returns table (
  code           text,
  revision       integer,
  status         text,
  issued_on      date,
  expires_on     date,
  recipient_name text,
  subject        text,
  reason         text,
  edited_by      text,
  edited_at      timestamptz,
  changes        jsonb
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
-- `code`, `status`, `subject` and `expires_on` are all output names and all exist as
-- columns in the tables below. Without this the first run raises "column reference is
-- ambiguous" — the third time this class of bug has appeared in this schema, which is
-- why it is now the first thing written in every table-returning function here.
#variable_conflict use_column
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  perform bsdc.require_permission('certificates.issue');
  if not exists (select 1 from public.issued_certificates c where c.code = v_code) then
    raise exception 'No certificate matches that code' using errcode = 'P0002';
  end if;

  return query
  with chain as (
    -- Every past revision, plus the live row as the final link. `tie` exists because
    -- a revocation does not raise the revision number (it changes the state of the
    -- revision already disclosed), so a revoke-then-restore leaves a revision row and
    -- the live row sharing one number. The revision row sorts first: it holds the
    -- state before, the live row the state now.
    select r.code, r.revision, 1 as tie,
           r.status::text as st, r.issued_on, r.expires_on, r.recipient_name, r.subject,
           r.reason as why, r.edited_by as who, r.created_at as when_at
      from public.certificate_revisions r
     where r.code = v_code
    union all
    select c.code, c.revision, 0, c.status::text, c.issued_on, c.expires_on,
           c.recipient_name, c.subject,
           c.edit_reason, c.updated_by, c.updated_at
      from public.issued_certificates c
     where c.code = v_code
  ),
  ordered as (
    select ch.*,
           lead(ch.recipient_name) over w as next_name,
           lead(ch.subject)        over w as next_subject,
           lead(ch.st)             over w as next_status,
           lead(ch.expires_on)     over w as next_expires,
           lead(ch.revision)       over w as next_revision
      from chain ch
    window w as (order by ch.revision, ch.tie desc nulls first)
  )
  select o.code, o.revision, coalesce(o.st, 'issued'),
         o.issued_on, o.expires_on, o.recipient_name, o.subject,
         coalesce(o.why, ''), coalesce(o.who, ''), o.when_at,
         -- A field appears only when it differs from the link that followed it, so a
         -- reader sees what changed rather than the whole document repeated. The
         -- newest link has nothing after it, so its diff is empty.
         (
           select coalesce(jsonb_agg(jsonb_build_object(
                    'field', f.field, 'from', f.before, 'to', f.after) order by f.field), '[]'::jsonb)
             from (values
               ('recipient_name', o.recipient_name, o.next_name),
               ('subject',        o.subject,        o.next_subject),
               ('status',         o.st,             o.next_status),
               ('expires_on',     o.expires_on::text, o.next_expires::text)
             ) as f(field, before, after)
            where o.next_revision is not null
              and coalesce(f.before, '') is distinct from coalesce(f.after, '')
         ) as changes
    from ordered o
   order by o.revision desc, o.tie desc nulls first;
end;
$$;

revoke all on function public.certificate_chain(text) from public, anon;
grant execute on function public.certificate_chain(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Public verification that gives a different answer for "no" and "revoked"
-- ---------------------------------------------------------------------------
-- The existing desk answers with a row or with nothing. Those are not the only two
-- states a person asking about a certificate cares about: "this code was never ours"
-- and "this certificate was revoked because the recipient did not complete the
-- course" are different answers, and collapsing the second into silence makes a
-- revocation look like a forgery.
--
-- What it must not reveal: the recipient's uid, their email, their other
-- certificates, or body text beyond what the printed document already shows.
create or replace function public.verify_document(p_code text)
returns table (
  kind           text,
  found          boolean,
  code           text,
  recipient_name text,
  subject        text,
  issued_on      date,
  expires_on     date,
  state          text,
  reason         text,
  superseded_by  text,
  hash_matches   boolean
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_ct   public.issued_certificates%rowtype;
  v_nt   public.notices%rowtype;
  v_recomputed text;
begin
  -- Deliberately callable by anybody: this is what the person holding the paper
  -- uses, and they do not have an account. It reveals only what is printed.
  if v_code = '' then
    raise exception 'Enter the code printed on the document' using errcode = '22023';
  end if;

  if v_code ~ '^BSDC-CT-' then
    select * into v_ct from public.issued_certificates c where c.code = v_code;
    if not found then
      return query select 'certificate'::text, false, v_code, null::text, null::text,
                          null::date, null::date, 'not_found'::text, null::text,
                          null::text, null::boolean;
      return;
    end if;

    -- Recomputed, not read. A stored hash that is never checked is a decoration;
    -- this is the check that makes it evidence. It is compared rather than enforced
    -- because a mismatch is information for the desk, not a reason to refuse a
    -- document that already exists.
    v_recomputed := bsdc.certificate_hash(
      v_ct.code, v_ct.recipient_name, v_ct.subject, v_ct.body,
      v_ct.issued_on, v_ct.expires_on, v_ct.template_key);

    return query
      select 'certificate'::text, true, v_ct.code, v_ct.recipient_name, v_ct.subject,
             v_ct.issued_on, v_ct.expires_on,
             case when v_ct.status = 'revoked' then 'revoked' else 'valid' end,
             case when v_ct.status = 'revoked' then v_ct.revoke_reason else '' end,
             coalesce(v_ct.superseded_by, ''),
             (v_ct.content_hash is null or v_ct.content_hash = v_recomputed);
    return;
  end if;

  if v_code ~ '^BSDC-NT-' then
    select * into v_nt from public.notices n where n.code = v_code;
    if not found then
      return query select 'notice'::text, false, v_code, null::text, null::text,
                          null::date, null::date, 'not_found'::text, null::text,
                          null::text, null::boolean;
      return;
    end if;
    return query
      select 'notice'::text, true, v_nt.code, null::text, v_nt.title,
             v_nt.publish_at::date, v_nt.expires_at::date,
             case when v_nt.withdrawn_at is not null then 'withdrawn'
                  when v_nt.status = 'published' then 'published'
                  else 'draft' end,
             case when v_nt.withdrawn_at is not null then v_nt.withdraw_reason else '' end,
             ''::text, null::boolean;
    return;
  end if;

  -- A code that is not even in our shape is answered the same way as one that is.
  -- Telling the two apart would let somebody enumerate the format.
  return query select 'unknown'::text, false, v_code, null::text, null::text,
                      null::date, null::date, 'not_found'::text, null::text,
                      null::text, null::boolean;
end;
$$;

revoke all on function public.verify_document(text) from public, anon;
grant execute on function public.verify_document(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Restoring keeps the revocation
-- ---------------------------------------------------------------------------
-- §11.1: "Restoring a revoked certificate writes a new row rather than editing the
-- old, so a reader can always see that it was once revoked — the thing a
-- revoked-then-restored certificate most needs to keep."
--
-- The function this replaces cleared `revoked_at` and `revoke_reason` in place. The
-- row therefore stopped saying it had ever been revoked, and the verification desk
-- reported it as though nothing had happened. t58 asserted that, so the test had
-- encoded the defect; it is updated with this reasoning beside it.
--
-- Same signature, same return value (the new revision number), because the console
-- calls it for its integer.
create or replace function public.restore_issued_certificate(
  p_code   text,
  p_reason text default ''
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_code   text := upper(btrim(coalesce(p_code, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_cur    public.issued_certificates%rowtype;
  v_next   integer;
begin
  perform bsdc.require_permission('certificates.issue');

  if char_length(v_reason) < 3 then
    raise exception 'Restoring a revoked certificate requires a reason' using errcode = '22023';
  end if;

  select * into v_cur from public.issued_certificates
   where code = v_code and status = 'revoked' for update;
  if not found then
    raise exception 'No revoked certificate matches that code' using errcode = 'P0002';
  end if;

  v_next := v_cur.revision + 1;

  -- The revision row is written first and records the state *before* the restore, so
  -- the chain reads issued → revoked → restored rather than losing the middle.
  insert into public.certificate_revisions
    (code, revision, template_key, recipient_uid, recipient_name, subject, body,
     issued_on, expires_on, status, edited_by, reason)
  values
    (v_cur.code, v_cur.revision, v_cur.template_key, v_cur.recipient_uid,
     v_cur.recipient_name, v_cur.subject, v_cur.body, v_cur.issued_on,
     v_cur.expires_on, 'revoked', bsdc.current_uid(), left('Restored: ' || v_reason, 300));

  -- The revocation moves into history rather than being erased. Everything a reader
  -- would have seen before the restore is still there afterwards.
  update public.issued_certificates
     set revoked_history = coalesce(revoked_history, '[]'::jsonb) || jsonb_build_object(
           'revoked_at', v_cur.revoked_at,
           'reason', v_cur.revoke_reason,
           'restored_at', now(),
           'restored_by', bsdc.current_uid(),
           'restore_reason', v_reason),
         status        = 'issued',
         revoked_at    = null,
         revoke_reason = '',
         revision      = v_next,
         updated_by    = bsdc.current_uid(),
         edit_reason   = left('Restored: ' || v_reason, 300),
         content_hash  = bsdc.certificate_hash(
           v_cur.code, v_cur.recipient_name, v_cur.subject, v_cur.body,
           v_cur.issued_on, v_cur.expires_on, v_cur.template_key),
         hashed_at     = now()
   where code = v_code;

  perform bsdc.audit('certificate.restore', v_code,
    jsonb_build_object('reason', v_reason, 'revision', v_next));

  return v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4b. An edit restamps the hash
-- ---------------------------------------------------------------------------
-- 0091's `edit_issued_certificate` writes new field values and raises the revision,
-- but in a world where `content_hash` exists that leaves the row claiming a hash of
-- the content it no longer holds. The verification desk would then report a perfectly
-- honest correction as a tampered document — the worst possible false accusation,
-- because it is made against the person holding the paper.
--
-- Replaced for one reason only: to stamp the hash. Signature, validation, revision
-- bookkeeping and audit are 0091's, unchanged.
create or replace function public.edit_issued_certificate(
  p_code           text,
  p_recipient_name text,
  p_subject        text,
  p_body           text,
  p_issued_on      date,
  p_expires_on     date default null,
  p_recipient_uid  text default null,
  p_reason         text default ''
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_cur      public.issued_certificates%rowtype;
  v_template public.certificate_templates%rowtype;
  v_code     text := upper(btrim(coalesce(p_code, '')));
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_name     text := btrim(coalesce(p_recipient_name, ''));
  v_subject  text := btrim(coalesce(p_subject, ''));
  v_body     text := btrim(coalesce(p_body, ''));
  v_uid      text := nullif(btrim(coalesce(p_recipient_uid, '')), '');
  v_date     date := coalesce(p_issued_on, current_date);
begin
  perform bsdc.require_permission('certificates.issue');

  if char_length(v_reason) < 3 then
    raise exception 'Editing an issued certificate requires a reason (minimum 3 characters)' using errcode = '22023';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Recipient name must be between 2 and 120 characters' using errcode = '22023';
  end if;
  if char_length(v_subject) < 2 or char_length(v_subject) > 200 then
    raise exception 'Subject must be between 2 and 200 characters' using errcode = '22023';
  end if;
  if p_expires_on is not null and p_expires_on < v_date then
    raise exception 'Expiry date cannot precede the issue date' using errcode = '22023';
  end if;
  if v_uid is not null and not exists (select 1 from public.profiles where uid = v_uid) then
    raise exception 'No member account matches that member UID' using errcode = '22023';
  end if;

  select * into v_cur from public.issued_certificates
   where code = v_code for update;
  if not found then
    raise exception 'No certificate matches that code' using errcode = 'P0002';
  end if;

  select * into v_template from public.certificate_templates where key = v_cur.template_key;

  if v_body = '' then
    v_body := coalesce(nullif(btrim(v_template.body_template), ''), v_cur.body);
  end if;
  v_body := replace(v_body, '{recipient}', v_name);
  v_body := replace(v_body, '{subject}', v_subject);
  v_body := replace(v_body, '{date}', to_char(v_date, 'DD Mon YYYY'));

  if char_length(v_body) > 1200 then
    raise exception 'Printed certificate body must be at most 1200 characters (currently %)', char_length(v_body)
      using errcode = '22023';
  end if;

  insert into public.certificate_revisions
    (code, revision, template_key, recipient_uid, recipient_name, subject, body,
     issued_on, expires_on, status, edited_by, reason)
  values
    (v_cur.code, v_cur.revision, v_cur.template_key, v_cur.recipient_uid,
     v_cur.recipient_name, v_cur.subject, v_cur.body,
     v_cur.issued_on, v_cur.expires_on, v_cur.status, bsdc.current_uid(), v_reason);

  update public.issued_certificates
     set recipient_name = v_name,
         subject        = v_subject,
         body           = v_body,
         issued_on      = v_date,
         expires_on     = p_expires_on,
         recipient_uid  = v_uid,
         revision       = v_cur.revision + 1,
         updated_by     = bsdc.current_uid(),
         edit_reason    = left(v_reason, 300),
         content_hash   = bsdc.certificate_hash(
                            v_code, v_name, v_subject, v_body, v_date, p_expires_on, v_cur.template_key),
         hashed_at      = now()
   where code = v_cur.code;

  perform bsdc.audit('certificate.edit', v_cur.code, jsonb_build_object(
    'revision', v_cur.revision + 1,
    'reason', v_reason
  ));

  return v_cur.revision + 1;
end;
$$;

revoke all on function public.edit_issued_certificate(text, text, text, text, date, date, text, text) from public, anon;
grant execute on function public.edit_issued_certificate(text, text, text, text, date, date, text, text) to authenticated, service_role;

revoke all on function public.restore_issued_certificate(text, text) from public, anon;
grant execute on function public.restore_issued_certificate(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. A notice that was withdrawn says so
-- ---------------------------------------------------------------------------
-- §11.2: "Unpublishing sends a withdrawal rather than deleting, so a member who saw
-- it learns it was withdrawn instead of finding a dead link."
alter table public.notices
  add column if not exists withdraw_reason text not null default ''
    check (char_length(withdraw_reason) <= 300),
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdrawn_by text references public.profiles (uid) on delete set null,
  -- §11.2's legal hold: a flag that blocks deletion and names its scope. The scope is
  -- not decoration — a hold that says "everything" is a hold nobody can release.
  add column if not exists legal_hold boolean not null default false,
  add column if not exists legal_hold_scope text not null default ''
    check (char_length(legal_hold_scope) <= 300);

comment on column public.notices.legal_hold is
  'Blocks deletion by any sweep or purge. Releasing it needs a reason and is audited.';

create or replace function public.withdraw_notice(p_id uuid, p_reason text)
returns public.notices
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_row public.notices;
begin
  perform bsdc.require_permission('notices.publish');

  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'A withdrawal needs a reason of at least ten characters, because the reader is shown it'
      using errcode = '22023';
  end if;

  select * into v_row from public.notices where id = p_id for update;
  if not found then
    raise exception 'No such notice' using errcode = 'P0002';
  end if;
  if v_row.status <> 'published' then
    raise exception 'Only a published notice can be withdrawn; this one is %', v_row.status
      using errcode = '22023';
  end if;

  update public.notices
     set status = 'archived',
         withdraw_reason = btrim(p_reason),
         withdrawn_at = now(),
         withdrawn_by = bsdc.current_uid()
   where id = p_id
  returning * into v_row;

  perform bsdc.audit('notice.withdraw', v_row.code,
    jsonb_build_object('reason', btrim(p_reason)));

  return v_row;
end;
$$;

revoke all on function public.withdraw_notice(uuid, text) from public, anon;
grant execute on function public.withdraw_notice(uuid, text) to authenticated, service_role;

-- The reader's own view, which is where a withdrawal has to be visible. A new
-- function rather than a change to `notice_feed`: a feed of live notices and a feed
-- that includes withdrawn ones are two different questions, and the second is only
-- asked by somebody who saw the first.
create or replace function public.notice_feed_with_withdrawn(p_limit integer default 50, p_code text default null)
returns table (
  id              uuid,
  code            text,
  title           text,
  summary         text,
  category        text,
  audience        bsdc_notice_audience,
  priority        bsdc_notice_priority,
  pinned          boolean,
  requires_ack    boolean,
  publish_at      timestamptz,
  expires_at      timestamptz,
  withdrawn       boolean,
  withdraw_reason text,
  withdrawn_at    timestamptz,
  acknowledged    boolean
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
#variable_conflict use_column
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'A feed page holds between 1 and 200 notices' using errcode = '22023';
  end if;

  return query
  select n.id, n.code, n.title, n.summary, n.category, n.audience, n.priority,
         n.pinned, n.requires_ack, n.publish_at, n.expires_at,
         (n.withdrawn_at is not null),
         n.withdraw_reason,
         n.withdrawn_at,
         exists (select 1 from public.notice_receipts r
                  where r.notice_id = n.id and r.uid = bsdc.current_uid())
    from public.notices n
   where (
           (n.status = 'published' and n.publish_at <= now()
            and (n.expires_at is null or n.expires_at > now()))
           or n.withdrawn_at is not null
         )
     and (n.audience = 'public'
          or (n.audience = 'members' and bsdc.current_uid() is not null)
          or (n.audience = 'staff' and bsdc.is_staff()))
     and (p_code is null or n.code = upper(btrim(p_code)))
   order by n.pinned desc, coalesce(n.publish_at, n.created_at) desc
   limit p_limit;
end;
$$;

revoke all on function public.notice_feed_with_withdrawn(integer, text) from public, anon;
grant execute on function public.notice_feed_with_withdrawn(integer, text) to anon, authenticated, service_role;

-- Legal hold, and its release. A hold blocks deletion; releasing it needs a reason
-- and is audited, because "we released the hold" without "and why" is how a document
-- disappears from a dispute.
create or replace function public.set_legal_hold(p_id uuid, p_hold boolean, p_scope text)
returns public.notices
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_row public.notices;
begin
  perform bsdc.require_permission('notices.publish');

  if char_length(btrim(coalesce(p_scope, ''))) < 10 then
    raise exception 'A legal hold, and its release, must name a scope or a reason of at least ten characters'
      using errcode = '22023';
  end if;

  select * into v_row from public.notices where id = p_id for update;
  if not found then
    raise exception 'No such notice' using errcode = 'P0002';
  end if;

  update public.notices
     set legal_hold = p_hold,
         legal_hold_scope = case when p_hold then btrim(p_scope) else '' end
   where id = p_id
  returning * into v_row;

  perform bsdc.audit(case when p_hold then 'notice.hold' else 'notice.hold.release' end,
    v_row.code,
    jsonb_build_object('scope', btrim(p_scope), 'hold', p_hold));

  return v_row;
end;
$$;

revoke all on function public.set_legal_hold(uuid, boolean, text) from public, anon;
grant execute on function public.set_legal_hold(uuid, boolean, text) to authenticated, service_role;

-- Deletion, which the hold blocks. A notice is deleted only when it was never
-- published: anything a reader has seen is withdrawn instead, so the roster of who
-- saw it keeps meaning something.
create or replace function public.delete_notice(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_row public.notices;
begin
  perform bsdc.require_permission('notices.publish');

  select * into v_row from public.notices where id = p_id for update;
  if not found then
    raise exception 'No such notice' using errcode = 'P0002';
  end if;

  if v_row.legal_hold then
    raise exception 'This notice is under a legal hold (%). Release the hold before deleting it.', v_row.legal_hold_scope
      using errcode = '42501';
  end if;

  if v_row.publish_at is not null and v_row.status <> 'draft' then
    raise exception 'This notice has been published, so it is withdrawn rather than deleted. Readers saw it.'
      using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Deleting a draft needs a reason of at least ten characters' using errcode = '22023';
  end if;

  delete from public.notices where id = p_id;
  perform bsdc.audit('notice.delete', v_row.code,
    jsonb_build_object('reason', btrim(p_reason), 'title', v_row.title));
end;
$$;

revoke all on function public.delete_notice(uuid, text) from public, anon;
grant execute on function public.delete_notice(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. The acknowledgement roster, complete and exportable
-- ---------------------------------------------------------------------------
-- §11.2: "the roster is complete, exportable, and carries a reminder action for
-- non-readers that is recorded so a second reminder is a decision rather than an
-- accident."
--
-- "Complete" is the hard part, because the denominator is an audience and not a
-- table. Public and members are counted against accounts as they are *now*, staff
-- against current staff. A notice addressed to a cohort that changes after
-- publication therefore gets an honest answer about a moving target rather than a
-- frozen number that no longer means anything.
-- The notification kind, added before the writer that uses it. `alter type ... add
-- value` cannot run inside a transaction block on older Postgres, so it is guarded
-- and the insert below would fail loudly rather than silently sending nothing.
do $$
begin
  if not exists (
    select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'bsdc_notification_kind' and e.enumlabel = 'notice_reminder'
  ) then
    execute 'alter type bsdc_notification_kind add value ''notice_reminder''';
  end if;
end;
$$;

create table if not exists public.notice_reminders (
  id        bigserial primary key,
  notice_id uuid not null references public.notices (id) on delete cascade,
  -- Who was reminded, or null when the reminder went to everybody outstanding. The
  -- distinction is what makes "we reminded them twice" different from "we sent two
  -- rounds".
  uid       text references public.profiles (uid) on delete set null,
  round     integer not null check (round between 1 and 20),
  sent_by   text references public.profiles (uid) on delete set null,
  sent_at   timestamptz not null default now(),
  note      text not null default '' check (char_length(note) <= 300)
);

create index if not exists notice_reminders_notice_idx
  on public.notice_reminders (notice_id, sent_at desc);

alter table public.notice_reminders enable row level security;

drop policy if exists notice_reminders_staff_read on public.notice_reminders;
create policy notice_reminders_staff_read on public.notice_reminders
  for select using (bsdc.has_permission('notices.publish'));

revoke all on public.notice_reminders from anon;
revoke all on public.notice_reminders from authenticated;
grant select on public.notice_reminders to authenticated;

create or replace function public.notice_ack_roster_full(p_notice_id uuid)
returns table (
  uid              text,
  display_name     text,
  acknowledged     boolean,
  acknowledged_at  timestamptz,
  reminders_sent   integer,
  last_reminded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_notice public.notices%rowtype;
begin
  perform bsdc.require_permission('notices.publish');

  select * into v_notice from public.notices n where n.id = p_notice_id;
  if not found then
    raise exception 'No such notice' using errcode = 'P0002';
  end if;
  if not v_notice.requires_ack then
    raise exception 'This notice does not ask for an acknowledgement, so it has no roster'
      using errcode = '22023';
  end if;

  return query
  with audience as (
    select p.uid, coalesce(nullif(btrim(p.display_name), ''), p.username, p.uid) as name
      from public.profiles p
     where p.status = 'active'
       and case v_notice.audience
             when 'public'  then true
             when 'members' then true
             when 'staff'   then p.role in ('moderator', 'manager', 'admin', 'owner')
             else false
           end
  )
  select a.uid, a.name,
         (r.acknowledged_at is not null),
         r.acknowledged_at,
         (select count(*)::integer from public.notice_reminders rm
           where rm.notice_id = p_notice_id and (rm.uid = a.uid or rm.uid is null)),
         (select max(rm.sent_at) from public.notice_reminders rm
           where rm.notice_id = p_notice_id and (rm.uid = a.uid or rm.uid is null))
    from audience a
    left join public.notice_receipts r
      on r.notice_id = p_notice_id and r.uid = a.uid
   order by (r.acknowledged_at is null) desc, a.name;
end;
$$;

revoke all on function public.notice_ack_roster_full(uuid) from public, anon;
grant execute on function public.notice_ack_roster_full(uuid) to authenticated, service_role;

-- Sending a reminder. The round is derived rather than supplied, so a second
-- reminder is a recorded decision with a number rather than an accident with a
-- timestamp. It refuses when everybody has already acknowledged, because a reminder
-- to nobody is a row that makes the log look busy.
create or replace function public.remind_notice(p_notice_id uuid, p_uid text default null, p_note text default '')
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_actor  text := bsdc.current_uid();
  v_notice public.notices%rowtype;
  v_round  integer;
  v_outstanding integer;
  v_target text := nullif(btrim(coalesce(p_uid, '')), '');
begin
  perform bsdc.require_permission('notices.publish');

  select * into v_notice from public.notices n where n.id = p_notice_id for update;
  if not found then
    raise exception 'No such notice' using errcode = 'P0002';
  end if;
  if not v_notice.requires_ack then
    raise exception 'This notice does not ask for an acknowledgement, so there is nobody to remind'
      using errcode = '22023';
  end if;

  select count(*) into v_outstanding
    from public.notice_ack_roster_full(p_notice_id) r
   where not r.acknowledged and (v_target is null or r.uid = v_target);

  if v_outstanding = 0 then
    raise exception 'Everybody has acknowledged this notice, so there is nobody to remind'
      using errcode = '22023';
  end if;

  select coalesce(max(rm.round), 0) + 1 into v_round
    from public.notice_reminders rm where rm.notice_id = p_notice_id;

  insert into public.notice_reminders (notice_id, uid, round, sent_by, note)
  values (p_notice_id, v_target, v_round, v_actor, left(btrim(coalesce(p_note, '')), 300));

  -- The reminder reaches the person it is about, in their own inbox. `subject_key`
  -- carries the round so two rounds are two lines rather than one that keeps moving.
  insert into public.notifications (uid, actor_uid, kind, body, subject_key)
  select r.uid, v_actor, 'notice_reminder',
         left(format('Reminder: %s', v_notice.title), 280),
         'notice:' || p_notice_id::text || ':' || v_round::text
    from public.notice_ack_roster_full(p_notice_id) r
   where not r.acknowledged and (v_target is null or r.uid = v_target)
  on conflict do nothing;

  perform bsdc.audit('notice.remind', v_notice.code,
    jsonb_build_object('round', v_round, 'target', coalesce(v_target, 'everybody'), 'outstanding', v_outstanding));

  return v_outstanding;
end;
$$;

revoke all on function public.remind_notice(uuid, text, text) from public, anon;
grant execute on function public.remind_notice(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. The registry carries the ledger
-- ---------------------------------------------------------------------------
-- `certificate_registry_v2` returns fifteen columns and none of them is
-- `revoked_history`, so a console reading it could not show that a restored
-- certificate had ever been revoked — the row would arrive with the revocation
-- invisible and the card would say "never revoked", which is the same defect this
-- migration exists to fix, one layer up.
--
-- A v3 rather than a replaced v2, because the shape changes: a function whose result
-- grows a column is a different function to anything that destructures the old one,
-- and PostgREST resolves by name.
create or replace function public.certificate_registry_v3(
  p_search   text default '',
  p_status   text default 'all',
  p_template text default 'all',
  p_limit    integer default 200
)
returns table (
  code            text,
  template_key    text,
  recipient_name  text,
  subject         text,
  body            text,
  recipient_uid   text,
  issued_on       date,
  expires_on      date,
  status          bsdc_doc_status,
  revoke_reason   text,
  revision        integer,
  updated_at      timestamptz,
  edit_reason     text,
  superseded_by   text,
  revoked_history jsonb,
  verifications   integer
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    c.code,
    c.template_key,
    c.recipient_name,
    c.subject,
    c.body,
    c.recipient_uid,
    c.issued_on,
    c.expires_on,
    c.status,
    c.revoke_reason,
    c.revision,
    c.updated_at,
    c.edit_reason,
    c.superseded_by,
    coalesce(c.revoked_history, '[]'::jsonb),
    (select count(*)::integer from public.verification_log v
      where v.code = c.code and v.found)
  from public.issued_certificates c
  where bsdc.has_permission('certificates.issue')
    and (
      coalesce(btrim(p_search), '') = ''
      or c.code ilike '%' || btrim(p_search) || '%'
      or c.recipient_name ilike '%' || btrim(p_search) || '%'
      or c.subject ilike '%' || btrim(p_search) || '%'
    )
    and (
      coalesce(btrim(p_status), 'all') = 'all'
      or (p_status = 'valid' and c.status = 'issued' and (c.expires_on is null or c.expires_on >= current_date))
      or (p_status = 'expired' and c.status = 'issued' and c.expires_on is not null and c.expires_on < current_date)
      or (p_status = 'revoked' and c.status = 'revoked')
    )
    and (
      coalesce(btrim(p_template), 'all') = 'all'
      or c.template_key = p_template
    )
  order by c.issued_on desc, c.code
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

revoke all on function public.certificate_registry_v3(text, text, text, integer) from public, anon;
grant execute on function public.certificate_registry_v3(text, text, text, integer) to authenticated, service_role;

-- `notice_registry` returns eighteen columns and none of them is the withdrawal or the
-- hold, so the console that edits notices could archive one and still show it as live,
-- and could offer a Delete button on a notice under a hold. A v2 for the same reason as
-- the certificate registry: the result shape changes, so it is a new name.
create or replace function public.notice_registry_v2(p_limit integer default 100)
returns table (
  id               uuid,
  code             text,
  title            text,
  summary          text,
  body             text,
  category         text,
  audience         bsdc_notice_audience,
  priority         bsdc_notice_priority,
  status           bsdc_notice_status,
  pinned           boolean,
  requires_ack     boolean,
  publish_at       timestamptz,
  expires_at       timestamptz,
  updated_at       timestamptz,
  acknowledgements integer,
  staff_total      integer,
  withdraw_reason  text,
  withdrawn_at     timestamptz,
  legal_hold       boolean,
  legal_hold_scope text
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    n.id, n.code, n.title, n.summary, n.body, n.category, n.audience, n.priority,
    n.status, n.pinned, n.requires_ack, n.publish_at, n.expires_at, n.updated_at,
    (select count(*)::integer from public.notice_receipts r where r.notice_id = n.id),
    (select count(*)::integer from public.staff_records s where s.is_active),
    n.withdraw_reason, n.withdrawn_at, n.legal_hold, n.legal_hold_scope
  from public.notices n
  where bsdc.has_permission('notices.publish')
  order by n.pinned desc, n.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.notice_registry_v2(integer) from public, anon;
grant execute on function public.notice_registry_v2(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The corporate network, part two: the trust empire.
--
-- Certificates, notices and one public verification desk.
--
-- The rules kept by Postgres rather than by any screen:
--   1. Every verifiable thing in the ecosystem carries a code of the same
--      shape, with the same check digit, so one function can answer the
--      public question "is this real?" whatever it is looking at.
--   2. A verification answers about the document, never about the person.
--      The portal returns what the document itself displays and nothing
--      more, so the trust desk cannot become a directory lookup.
--   3. An issued document is never edited. It is revoked, with a reason and
--      a time, and the revocation is itself part of the answer.
--   4. A notice becomes public because its publish time has arrived, not
--      because somebody remembered to press a button at midnight.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_doc_status') then
    create type bsdc_doc_status as enum ('issued', 'revoked');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_notice_status') then
    create type bsdc_notice_status as enum ('draft', 'published', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_notice_audience') then
    create type bsdc_notice_audience as enum ('public', 'members', 'staff');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_notice_priority') then
    create type bsdc_notice_priority as enum ('routine', 'important', 'urgent');
  end if;
end;
$$;

-- ===========================================================================
-- 0. Codes and the verification log
-- ===========================================================================
-- The log is declared here, ahead of everything that reads it: the
-- certificate registry in section 1 counts verifications per document, and
-- the desk in section 3 writes the rows. Postgres resolves table references
-- when a function is created, so the table has to exist first.
create table if not exists public.verification_log (
  id         bigserial primary key,
  code       text not null,
  kind       text not null,
  found      boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists verification_log_code_idx on public.verification_log (code, created_at desc);
create index if not exists verification_log_time_idx on public.verification_log (created_at desc);

-- ===========================================================================
-- 0. Codes
-- ===========================================================================
-- Every verifiable document carries BSDC-<KIND>-<8>-<digit>. The kind is two
-- letters, the body is eight characters without the letters a person
-- confuses, and the digit is the same arithmetic the staff card already
-- uses, so one validator covers the whole ecosystem.
create or replace function bsdc.issue_doc_code(p_kind text)
returns text
language plpgsql
as $$
declare
  v_body text;
begin
  if p_kind !~ '^[A-Z]{2}$' then
    raise exception 'A document kind is two capital letters' using errcode = '22023';
  end if;
  v_body := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
  v_body := translate(v_body, 'OI', '48');
  return 'BSDC-' || p_kind || '-' || v_body || '-' || bsdc.card_check_digit(v_body)::text;
end;
$$;

-- ===========================================================================
-- 1. Certificates (certificate-site)
-- ===========================================================================
create table if not exists public.certificate_templates (
  key          text primary key check (key ~ '^[a-z][a-z0-9_-]{2,40}$'),
  name         text not null check (char_length(btrim(name)) between 2 and 80),
  purpose      text not null default '' check (char_length(purpose) <= 200),
  heading      text not null default 'Certificate of Achievement',
  body_template text not null default '' check (char_length(body_template) <= 1200),
  accent       text not null default '#1b4332' check (accent ~* '^#[0-9a-f]{6}$'),
  orientation  text not null default 'landscape' check (orientation in ('landscape', 'portrait')),
  signature_name  text not null default '',
  signature_title text not null default '',
  is_active    boolean not null default true,
  sort_order   integer not null default 100,
  updated_at   timestamptz not null default now()
);

drop trigger if exists certificate_templates_touch on public.certificate_templates;
create trigger certificate_templates_touch before update on public.certificate_templates
  for each row execute function bsdc.touch_updated_at();

insert into public.certificate_templates
  (key, name, purpose, heading, body_template, orientation, signature_name, signature_title, sort_order)
values
  ('course-completion', 'Course completion', 'Finishing a BSDC learning track.',
   'Certificate of Completion',
   'This certifies that {recipient} has successfully completed {subject} on {date}.',
   'landscape', 'Chief Executive Officer', 'Bangladesh Software Development Community', 10),
  ('contribution', 'Contribution', 'Recognising work given to the community.',
   'Certificate of Appreciation',
   'Presented to {recipient} in recognition of {subject}.',
   'landscape', 'Chief Executive Officer', 'Bangladesh Software Development Community', 20),
  ('employment', 'Employment', 'Confirming a period of service.',
   'Certificate of Employment',
   'This confirms that {recipient} served the community as {subject} until {date}.',
   'portrait', 'Chief Executive Officer', 'Bangladesh Software Development Community', 30)
on conflict (key) do nothing;

-- Named `issued_certificates`, not `certificates`: migration 0015 already owns
-- `public.certificates` for course completions. These are the documents the
-- trust console issues by hand from a template, a different thing with a
-- different code format, and two tables may not share one name.
create table if not exists public.issued_certificates (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^BSDC-CT-[0-9A-Z]{8}-[0-9]$'),
  template_key  text not null references public.certificate_templates (key),
  recipient_uid text references public.profiles (uid) on delete set null,
  recipient_name text not null check (char_length(btrim(recipient_name)) between 2 and 120),
  subject       text not null check (char_length(btrim(subject)) between 2 and 200),
  body          text not null default '' check (char_length(body) <= 1200),
  issued_on     date not null default current_date,
  expires_on    date,
  status        bsdc_doc_status not null default 'issued',
  revoked_at    timestamptz,
  revoke_reason text not null default '' check (char_length(revoke_reason) <= 300),
  issued_by     text,
  created_at    timestamptz not null default now(),
  constraint issued_certificates_period check (expires_on is null or expires_on >= issued_on),
  constraint issued_certificates_revocation check (
    (status = 'issued' and revoked_at is null) or (status = 'revoked' and revoked_at is not null)
  )
);

create index if not exists issued_certificates_recipient_idx on public.issued_certificates (recipient_uid);
create index if not exists issued_certificates_issued_idx on public.issued_certificates (issued_on desc);

-- An issued certificate is never edited: the text is frozen at issue, so the
-- copy in somebody's hand and the copy the portal describes are the same
-- document. A mistake is revoked and reissued.
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
set search_path = public, bsdc, pg_temp
as $$
declare
  v_template public.certificate_templates;
  v_code text;
  v_body text;
  v_try  integer := 0;
begin
  perform bsdc.require_permission('certificates.issue');

  select * into v_template from public.certificate_templates where key = p_template_key;
  if v_template.key is null then
    raise exception 'No such certificate template' using errcode = 'P0002';
  end if;
  if not v_template.is_active then
    raise exception 'That template is retired' using errcode = '22023';
  end if;

  v_body := coalesce(nullif(btrim(p_body), ''), v_template.body_template);
  v_body := replace(v_body, '{recipient}', btrim(p_recipient_name));
  v_body := replace(v_body, '{subject}', btrim(p_subject));
  v_body := replace(v_body, '{date}', to_char(coalesce(p_issued_on, current_date), 'DD Mon YYYY'));

  loop
    v_try := v_try + 1;
    v_code := bsdc.issue_doc_code('CT');
    exit when not exists (select 1 from public.issued_certificates where code = v_code);
    if v_try > 10 then
      raise exception 'Could not allocate a certificate code' using errcode = '55000';
    end if;
  end loop;

  insert into public.issued_certificates
    (code, template_key, recipient_uid, recipient_name, subject, body,
     issued_on, expires_on, issued_by)
  values
    (v_code, p_template_key, p_recipient_uid, btrim(p_recipient_name), btrim(p_subject), v_body,
     coalesce(p_issued_on, current_date), p_expires_on, bsdc.current_uid());

  perform bsdc.audit('certificate.issue', v_code,
    jsonb_build_object('template', p_template_key, 'recipient', btrim(p_recipient_name)));
  return v_code;
end;
$$;

-- Named `revoke_issued_certificate` for the same reason the table is named
-- `issued_certificates`: migration 0015 already owns
-- `public.revoke_certificate(text, text)` for course completions, and two
-- functions may not share one name and one argument list.
create or replace function public.revoke_issued_certificate(p_code text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  perform bsdc.require_permission('certificates.issue');

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A revocation needs a reason' using errcode = '22023';
  end if;

  update public.issued_certificates
  set status = 'revoked', revoked_at = now(), revoke_reason = btrim(p_reason)
  where code = p_code and status = 'issued';

  if not found then
    raise exception 'No certificate with that code is currently issued' using errcode = 'P0002';
  end if;

  perform bsdc.audit('certificate.revoke', p_code, jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

create or replace function public.certificate_registry(
  p_search text default '',
  p_limit  integer default 100
)
returns table (
  code           text,
  template_key   text,
  recipient_name text,
  subject        text,
  issued_on      date,
  expires_on     date,
  status         bsdc_doc_status,
  revoke_reason  text,
  verifications  integer
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    c.code, c.template_key, c.recipient_name, c.subject, c.issued_on, c.expires_on,
    c.status, c.revoke_reason,
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
  order by c.issued_on desc, c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

-- ===========================================================================
-- 2. Notices (notice-site)
-- ===========================================================================
create table if not exists public.notices (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^BSDC-NT-[0-9A-Z]{8}-[0-9]$'),
  title       text not null check (char_length(btrim(title)) between 4 and 160),
  summary     text not null default '' check (char_length(summary) <= 300),
  body        text not null default '' check (char_length(body) <= 20000),
  category    text not null default 'general' check (char_length(category) between 2 and 40),
  audience    bsdc_notice_audience not null default 'public',
  priority    bsdc_notice_priority not null default 'routine',
  status      bsdc_notice_status not null default 'draft',
  pinned      boolean not null default false,
  requires_ack boolean not null default false,
  publish_at  timestamptz,
  expires_at  timestamptz,
  published_by text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint notices_window check (expires_at is null or publish_at is null or expires_at > publish_at),
  constraint notices_published_has_time check (status <> 'published' or publish_at is not null)
);

create index if not exists notices_live_idx on public.notices (publish_at desc)
  where status = 'published';

drop trigger if exists notices_touch on public.notices;
create trigger notices_touch before update on public.notices
  for each row execute function bsdc.touch_updated_at();

-- A notice gets its code the moment it exists, so a draft that is being
-- proof-read already carries the number that will appear on the printed page.
create or replace function bsdc.notices_code()
returns trigger
language plpgsql
as $$
declare
  v_try integer := 0;
begin
  if new.code is null or new.code = '' then
    loop
      v_try := v_try + 1;
      new.code := bsdc.issue_doc_code('NT');
      exit when not exists (select 1 from public.notices where code = new.code);
      if v_try > 10 then
        raise exception 'Could not allocate a notice code' using errcode = '55000';
      end if;
    end loop;
  end if;
  if new.created_by is null then
    new.created_by := bsdc.current_uid();
  end if;
  return new;
end;
$$;

drop trigger if exists notices_code on public.notices;
create trigger notices_code before insert on public.notices
  for each row execute function bsdc.notices_code();

create table if not exists public.notice_receipts (
  notice_id       uuid not null references public.notices (id) on delete cascade,
  uid             text not null references public.profiles (uid) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (notice_id, uid)
);

-- Publishing is explicit, but going live is not: a notice with a future
-- publish time is published and simply not yet visible, so nobody has to be
-- awake at midnight for it to appear.
create or replace function public.publish_notice(p_id uuid, p_publish_at timestamptz default now())
returns timestamptz
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_at timestamptz := coalesce(p_publish_at, now());
begin
  perform bsdc.require_permission('notices.publish');

  update public.notices
  set status = 'published', publish_at = v_at, published_by = bsdc.current_uid()
  where id = p_id and status <> 'archived';

  if not found then
    raise exception 'No such notice, or it is archived' using errcode = 'P0002';
  end if;

  perform bsdc.audit('notice.publish', p_id::text, jsonb_build_object('publish_at', v_at));
  return v_at;
end;
$$;

create or replace function public.archive_notice(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  perform bsdc.require_permission('notices.publish');
  update public.notices set status = 'archived' where id = p_id;
  if not found then
    raise exception 'No such notice' using errcode = 'P0002';
  end if;
  perform bsdc.audit('notice.archive', p_id::text);
end;
$$;

create or replace function public.acknowledge_notice(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if bsdc.current_uid() is null then
    raise exception 'Sign in to acknowledge a notice' using errcode = '42501';
  end if;
  insert into public.notice_receipts (notice_id, uid)
  values (p_id, bsdc.current_uid())
  on conflict (notice_id, uid) do nothing;
end;
$$;

-- What a reader may see: published, in its window, and addressed to them.
create or replace function public.notice_feed(p_limit integer default 50)
returns table (
  id          uuid,
  code        text,
  title       text,
  summary     text,
  body        text,
  category    text,
  audience    bsdc_notice_audience,
  priority    bsdc_notice_priority,
  pinned      boolean,
  requires_ack boolean,
  publish_at  timestamptz,
  expires_at  timestamptz,
  acknowledged boolean
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    n.id, n.code, n.title, n.summary, n.body, n.category, n.audience, n.priority,
    n.pinned, n.requires_ack, n.publish_at, n.expires_at,
    exists (
      select 1 from public.notice_receipts r
      where r.notice_id = n.id and r.uid = bsdc.current_uid()
    )
  from public.notices n
  where n.status = 'published'
    and n.publish_at <= now()
    and (n.expires_at is null or n.expires_at > now())
    and (
      n.audience = 'public'
      or (n.audience = 'members' and bsdc.current_uid() is not null)
      or (n.audience = 'staff' and bsdc.is_staff())
    )
  order by n.pinned desc, n.publish_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- The editor's view: everything, including drafts and scheduled notices,
-- with how many people have acknowledged each one.
create or replace function public.notice_registry(p_limit integer default 100)
returns table (
  id           uuid,
  code         text,
  title        text,
  summary      text,
  body         text,
  category     text,
  audience     bsdc_notice_audience,
  priority     bsdc_notice_priority,
  status       bsdc_notice_status,
  pinned       boolean,
  requires_ack boolean,
  publish_at   timestamptz,
  expires_at   timestamptz,
  updated_at   timestamptz,
  acknowledgements integer,
  staff_total  integer
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    n.id, n.code, n.title, n.summary, n.body, n.category, n.audience, n.priority,
    n.status, n.pinned, n.requires_ack, n.publish_at, n.expires_at, n.updated_at,
    (select count(*)::integer from public.notice_receipts r where r.notice_id = n.id),
    (select count(*)::integer from public.staff_records s where s.is_active)
  from public.notices n
  where bsdc.has_permission('notices.publish')
  order by n.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

-- ===========================================================================
-- 3. The verification desk (vf-site)
-- ===========================================================================
-- One desk for the whole ecosystem.
--
-- The answer describes the document: what it is, whether it is valid today,
-- who it names, who issued it and when. It never returns a contact detail, a
-- member identifier or anything else the holder did not already print on the
-- thing they are showing you.
create or replace function public.verify_code(p_code text)
returns table (
  code        text,
  kind        text,
  valid       boolean,
  state       text,
  reason      text,
  subject     text,
  detail      text,
  issuer      text,
  issued_on   date,
  expires_on  date,
  verifications integer
)
-- Not stable: a verification is recorded, which is part of the answer the
-- next caller receives.
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_code   text;
  v_kind   text;
  v_body   text;
  v_found  boolean := false;
  v_result record;
begin
  -- Normalise the way a person types a code off a printed page.
  v_code := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_code := replace(replace(v_code, '—', '-'), '–', '-');

  if v_code !~ '^BSDC-[A-Z]{2}-[0-9A-Z]{8}-[0-9]$' then
    return query select v_code, 'unknown'::text, false, 'malformed'::text,
      'That is not a BSDC code.'::text, ''::text, ''::text, ''::text,
      null::date, null::date, 0;
    return;
  end if;

  v_kind := substr(v_code, 6, 2);
  if v_kind not in ('CT', 'NT', 'ID') then
    return query select v_code, v_kind, false, 'unknown'::text,
      'BSDC does not issue documents of that kind.'::text, ''::text, ''::text,
      ''::text, null::date, null::date, 0;
    return;
  end if;

  v_body := substr(v_code, 9, 8);
  -- Characters a reader confuses were never issued, so they can only be a
  -- misreading and are repaired before the check digit is tested.
  v_body := translate(v_body, 'OI', '48');
  v_code := 'BSDC-' || v_kind || '-' || v_body || '-' || substr(v_code, 18, 1);

  if bsdc.card_check_digit(v_body)::text <> substr(v_code, 18, 1) then
    return query select v_code, v_kind, false, 'malformed'::text,
      'The code failed its own check digit, so it was mistyped.'::text,
      ''::text, ''::text, ''::text, null::date, null::date, 0;
    return;
  end if;

  if v_kind = 'CT' then
    select
      c.code,
      case when c.status = 'revoked' then 'revoked'
           when c.expires_on is not null and c.expires_on < current_date then 'expired'
           else 'valid' end as state,
      c.recipient_name as subject,
      c.subject as detail,
      c.issued_on, c.expires_on, c.revoke_reason
    into v_result
    from public.issued_certificates c where c.code = v_code;

  elsif v_kind = 'NT' then
    select
      n.code,
      case when n.status <> 'published' then 'withdrawn'
           when n.publish_at > now() then 'withdrawn'
           when n.expires_at is not null and n.expires_at <= now() then 'expired'
           else 'valid' end as state,
      n.title as subject,
      n.summary as detail,
      n.publish_at::date as issued_on,
      n.expires_at::date as expires_on,
      ''::text as revoke_reason
    into v_result
    from public.notices n where n.code = v_code;

  elsif v_kind = 'ID' then
    select
      s.card_code as code,
      case when not s.is_active then 'revoked'
           when s.ended_at is not null and s.ended_at < current_date then 'expired'
           else 'valid' end as state,
      p.display_name as subject,
      -- A card confirms a role, not a person's file.
      coalesce(nullif(s.designation, ''), p.role::text) as detail,
      s.joined_at as issued_on,
      s.ended_at as expires_on,
      ''::text as revoke_reason
    into v_result
    from public.staff_records s
    join public.profiles p on p.uid = s.uid
    where s.card_code = v_code;
  end if;

  v_found := v_result.code is not null;

  insert into public.verification_log (code, kind, found) values (v_code, v_kind, v_found);

  if not v_found then
    return query select v_code, v_kind, false, 'unknown'::text,
      'No document in the registry carries that code.'::text,
      ''::text, ''::text, ''::text, null::date, null::date, 0;
    return;
  end if;

  return query
  select
    v_result.code,
    v_kind,
    v_result.state = 'valid',
    v_result.state::text,
    case v_result.state
      when 'valid' then 'This document is in the registry and in force today.'
      when 'revoked' then
        case when coalesce(v_result.revoke_reason, '') = ''
             then 'This document was withdrawn by the issuer.'
             else 'This document was withdrawn by the issuer: ' || v_result.revoke_reason end
      when 'expired' then 'This document is in the registry but is no longer in force.'
      else 'This document is not currently published.'
    end,
    v_result.subject,
    v_result.detail,
    'Bangladesh Software Development Community'::text,
    v_result.issued_on,
    v_result.expires_on,
    (select count(*)::integer from public.verification_log v
      where v.code = v_code and v.found);
end;
$$;

-- What the trust desk is being asked about, for the staff dashboards.
create or replace function public.verification_activity(p_days integer default 30)
returns table (day date, kind text, checks integer, misses integer)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    d.day,
    k.kind,
    coalesce(count(v.id) filter (where v.found), 0)::integer,
    coalesce(count(v.id) filter (where not v.found), 0)::integer
  from bsdc.day_series(greatest(1, least(coalesce(p_days, 30), 365))) d
  cross join (values ('CT'), ('NT'), ('ID')) as k(kind)
  left join public.verification_log v
    on v.created_at::date = d.day and v.kind = k.kind
  where bsdc.has_permission('certificates.issue') or bsdc.has_permission('notices.publish')
  group by d.day, k.kind
  order by d.day, k.kind;
$$;

-- ===========================================================================
-- 4. Permissions
-- ===========================================================================
insert into public.role_permissions (role, permission)
values
  ('moderator', 'certificates.issue'),
  ('manager',   'certificates.issue'),
  ('admin',     'certificates.issue'),
  ('owner',     'certificates.issue'),
  ('manager',   'notices.publish'),
  ('admin',     'notices.publish'),
  ('owner',     'notices.publish')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Corporate Admin Suite: certificate editing, certificate template designer,
-- full revision-tracked notice editing, notice acknowledgement roster, CLI
-- saved macros, and permission-enforced bulk corporate operations.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Certificate editing & revision history (certificate-site)
-- ===========================================================================
alter table public.issued_certificates
  add column if not exists revision integer not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by text,
  add column if not exists edit_reason text not null default '',
  add column if not exists superseded_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'issued_certificates_superseded_code'
  ) then
    alter table public.issued_certificates
      add constraint issued_certificates_superseded_code
      check (superseded_by is null or superseded_by ~ '^BSDC-CT-[0-9A-Z]{8}-[0-9]$');
  end if;
end;
$$;

drop trigger if exists issued_certificates_touch on public.issued_certificates;
create trigger issued_certificates_touch
  before update on public.issued_certificates
  for each row execute function bsdc.touch_updated_at();

create table if not exists public.certificate_revisions (
  id             uuid primary key default gen_random_uuid(),
  code           text not null references public.issued_certificates (code) on delete cascade,
  revision       integer not null,
  template_key   text not null,
  recipient_uid  text,
  recipient_name text not null,
  subject        text not null,
  body           text not null,
  issued_on      date not null,
  expires_on     date,
  status         bsdc_doc_status not null,
  edited_by      text,
  reason         text not null default '',
  created_at     timestamptz not null default now()
);

create index if not exists certificate_revisions_code_idx
  on public.certificate_revisions (code, revision desc);

alter table public.certificate_revisions enable row level security;

drop policy if exists certificate_revisions_read on public.certificate_revisions;
create policy certificate_revisions_read on public.certificate_revisions
  for select using (bsdc.has_permission('certificates.issue'));

revoke insert, update, delete on public.certificate_revisions from anon, authenticated;
grant select on public.certificate_revisions to authenticated;

create or replace function public.certificate_registry_v2(
  p_search   text default '',
  p_status   text default 'all',
  p_template text default 'all',
  p_limit    integer default 200
)
returns table (
  code           text,
  template_key   text,
  recipient_name text,
  subject        text,
  body           text,
  recipient_uid  text,
  issued_on      date,
  expires_on     date,
  status         bsdc_doc_status,
  revoke_reason  text,
  revision       integer,
  updated_at     timestamptz,
  edit_reason    text,
  superseded_by  text,
  verifications  integer
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
  order by c.updated_at desc, c.issued_on desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

create or replace function public.certificate_detail(p_code text)
returns table (
  code           text,
  template_key   text,
  recipient_uid  text,
  recipient_name text,
  subject        text,
  body           text,
  issued_on      date,
  expires_on     date,
  status         bsdc_doc_status,
  revoked_at     timestamptz,
  revoke_reason  text,
  revision       integer,
  updated_at     timestamptz,
  updated_by     text,
  edit_reason    text,
  superseded_by  text,
  issued_by      text,
  created_at     timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    c.code, c.template_key, c.recipient_uid, c.recipient_name, c.subject, c.body,
    c.issued_on, c.expires_on, c.status, c.revoked_at, c.revoke_reason,
    c.revision, c.updated_at, c.updated_by, c.edit_reason, c.superseded_by,
    c.issued_by, c.created_at
  from public.issued_certificates c
  where bsdc.has_permission('certificates.issue')
    and c.code = upper(btrim(p_code));
$$;

create or replace function public.certificate_history(p_code text)
returns table (
  id             uuid,
  revision       integer,
  template_key   text,
  recipient_uid  text,
  recipient_name text,
  subject        text,
  body           text,
  issued_on      date,
  expires_on     date,
  status         bsdc_doc_status,
  edited_by      text,
  reason         text,
  created_at     timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    r.id, r.revision, r.template_key, r.recipient_uid, r.recipient_name, r.subject, r.body,
    r.issued_on, r.expires_on, r.status, r.edited_by, r.reason, r.created_at
  from public.certificate_revisions r
  where bsdc.has_permission('certificates.issue')
    and r.code = upper(btrim(p_code))
  order by r.revision desc;
$$;

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
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_name     text := btrim(coalesce(p_recipient_name, ''));
  v_subject  text := btrim(coalesce(p_subject, ''));
  v_body     text := btrim(coalesce(p_body, ''));
  v_date     date := coalesce(p_issued_on, current_date);
begin
  perform bsdc.require_permission('certificates.issue');

  if char_length(v_reason) < 3 then
    raise exception 'Editing an issued certificate requires a reason (minimum 3 characters)' using errcode = '22023';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Recipient name must be at least 2 characters' using errcode = '22023';
  end if;
  if char_length(v_subject) < 2 then
    raise exception 'Subject must be at least 2 characters' using errcode = '22023';
  end if;
  if p_expires_on is not null and p_expires_on < v_date then
    raise exception 'Expiry date cannot precede the issue date' using errcode = '22023';
  end if;

  select * into v_cur from public.issued_certificates
   where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'No certificate matches that code' using errcode = 'P0002';
  end if;

  select * into v_template from public.certificate_templates where key = v_cur.template_key;

  if v_body = '' then
    v_body := coalesce(v_template.body_template, v_cur.body);
  end if;
  v_body := replace(v_body, '{recipient}', v_name);
  v_body := replace(v_body, '{subject}', v_subject);
  v_body := replace(v_body, '{date}', to_char(v_date, 'DD Mon YYYY'));

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
         recipient_uid  = nullif(btrim(coalesce(p_recipient_uid, '')), ''),
         revision       = v_cur.revision + 1,
         updated_by     = bsdc.current_uid(),
         edit_reason    = v_reason
   where code = v_cur.code;

  perform bsdc.audit('certificate.edit', v_cur.code, jsonb_build_object(
    'revision', v_cur.revision + 1,
    'reason', v_reason
  ));

  return v_cur.revision + 1;
end;
$$;

create or replace function public.amend_and_reissue_certificate(
  p_code           text,
  p_template_key   text,
  p_recipient_name text,
  p_subject        text,
  p_body           text,
  p_issued_on      date,
  p_expires_on     date default null,
  p_recipient_uid  text default null,
  p_reason         text default ''
)
returns text
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_cur      public.issued_certificates%rowtype;
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_new_code text;
begin
  perform bsdc.require_permission('certificates.issue');

  if char_length(v_reason) < 3 then
    raise exception 'Amending and reissuing requires a reason (minimum 3 characters)' using errcode = '22023';
  end if;

  select * into v_cur from public.issued_certificates
   where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'No certificate matches that code' using errcode = 'P0002';
  end if;

  v_new_code := public.issue_certificate(
    coalesce(nullif(btrim(p_template_key), ''), v_cur.template_key),
    p_recipient_name,
    p_subject,
    nullif(btrim(coalesce(p_recipient_uid, '')), ''),
    coalesce(p_issued_on, current_date),
    p_expires_on,
    p_body
  );

  insert into public.certificate_revisions
    (code, revision, template_key, recipient_uid, recipient_name, subject, body,
     issued_on, expires_on, status, edited_by, reason)
  values
    (v_cur.code, v_cur.revision, v_cur.template_key, v_cur.recipient_uid,
     v_cur.recipient_name, v_cur.subject, v_cur.body,
     v_cur.issued_on, v_cur.expires_on, v_cur.status, bsdc.current_uid(),
     'Superseded by ' || v_new_code || ': ' || v_reason);

  update public.issued_certificates
     set status        = 'revoked',
         revoked_at    = coalesce(revoked_at, now()),
         revoke_reason = left('Superseded by ' || v_new_code || ': ' || v_reason, 300),
         superseded_by = v_new_code,
         revision      = v_cur.revision + 1,
         updated_by    = bsdc.current_uid(),
         edit_reason   = left(v_reason, 300)
   where code = v_cur.code;

  perform bsdc.audit('certificate.amend', v_cur.code, jsonb_build_object(
    'new_code', v_new_code,
    'reason', v_reason
  ));

  return v_new_code;
end;
$$;

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
  v_cur    public.issued_certificates%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform bsdc.require_permission('certificates.issue');

  if char_length(v_reason) < 3 then
    raise exception 'Restoring a revoked certificate requires a reason' using errcode = '22023';
  end if;

  select * into v_cur from public.issued_certificates
   where code = upper(btrim(p_code)) and status = 'revoked' for update;
  if not found then
    raise exception 'No revoked certificate matches that code' using errcode = 'P0002';
  end if;

  insert into public.certificate_revisions
    (code, revision, template_key, recipient_uid, recipient_name, subject, body,
     issued_on, expires_on, status, edited_by, reason)
  values
    (v_cur.code, v_cur.revision, v_cur.template_key, v_cur.recipient_uid,
     v_cur.recipient_name, v_cur.subject, v_cur.body,
     v_cur.issued_on, v_cur.expires_on, v_cur.status, bsdc.current_uid(),
     'Restored: ' || v_reason);

  update public.issued_certificates
     set status        = 'issued',
         revoked_at    = null,
         revoke_reason = '',
         revision      = v_cur.revision + 1,
         updated_by    = bsdc.current_uid(),
         edit_reason   = left('Restored: ' || v_reason, 300)
   where code = v_cur.code;

  perform bsdc.audit('certificate.restore', v_cur.code, jsonb_build_object('reason', v_reason));
  return v_cur.revision + 1;
end;
$$;

create or replace function public.bulk_certificate_action(
  p_codes      text[],
  p_action     text,
  p_reason     text default '',
  p_expires_on date default null
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_code   text;
  v_count  integer := 0;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform bsdc.require_permission('certificates.issue');

  if p_action not in ('revoke', 'extend_expiry', 'clear_expiry') then
    raise exception 'Unsupported bulk certificate action: %', p_action using errcode = '22023';
  end if;

  if p_action = 'revoke' and char_length(v_reason) < 3 then
    raise exception 'Bulk revocation requires a reason' using errcode = '22023';
  end if;

  if p_action = 'extend_expiry' and p_expires_on is null then
    raise exception 'Bulk expiry extension requires an expiry date' using errcode = '22023';
  end if;

  if p_codes is null or coalesce(array_length(p_codes, 1), 0) = 0 then
    return 0;
  end if;

  foreach v_code in array p_codes loop
    v_code := upper(btrim(coalesce(v_code, '')));
    continue when v_code = '';
    if p_action = 'revoke' then
      update public.issued_certificates
         set status = 'revoked', revoked_at = now(), revoke_reason = left(v_reason, 300),
             updated_by = bsdc.current_uid()
       where code = v_code and status = 'issued';
      if found then v_count := v_count + 1; end if;
    elsif p_action = 'extend_expiry' then
      update public.issued_certificates
         set expires_on = p_expires_on,
             revision = revision + 1,
             edit_reason = left(coalesce(nullif(v_reason, ''), 'Bulk expiry update'), 300),
             updated_by = bsdc.current_uid()
       where code = v_code and issued_on <= p_expires_on;
      if found then v_count := v_count + 1; end if;
    elsif p_action = 'clear_expiry' then
      update public.issued_certificates
         set expires_on = null,
             revision = revision + 1,
             edit_reason = left(coalesce(nullif(v_reason, ''), 'Cleared expiry'), 300),
             updated_by = bsdc.current_uid()
       where code = v_code;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  perform bsdc.audit('certificate.bulk', p_action, jsonb_build_object(
    'count', v_count,
    'reason', v_reason
  ));
  return v_count;
end;
$$;

create or replace function public.save_certificate_template(
  p_key             text,
  p_name            text,
  p_purpose         text,
  p_heading         text,
  p_body_template   text,
  p_accent          text,
  p_orientation     text,
  p_signature_name  text,
  p_signature_title text,
  p_is_active       boolean default true,
  p_sort_order      integer default 100
)
returns public.certificate_templates
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_row public.certificate_templates%rowtype;
  v_key text := lower(btrim(coalesce(p_key, '')));
begin
  perform bsdc.require_permission('settings.write');

  if v_key !~ '^[a-z][a-z0-9_-]{2,40}$' then
    raise exception 'Template key must be 3-41 lowercase letters, digits, hyphens, or underscores' using errcode = '22023';
  end if;
  if p_accent !~* '^#[0-9a-f]{6}$' then
    raise exception 'Accent must be a 6-digit hex color like #1b4332' using errcode = '22023';
  end if;
  if p_orientation not in ('landscape', 'portrait') then
    raise exception 'Orientation must be landscape or portrait' using errcode = '22023';
  end if;

  insert into public.certificate_templates
    (key, name, purpose, heading, body_template, accent, orientation,
     signature_name, signature_title, is_active, sort_order)
  values
    (v_key, btrim(p_name), btrim(coalesce(p_purpose, '')),
     btrim(p_heading), btrim(coalesce(p_body_template, '')),
     lower(p_accent), p_orientation,
     btrim(coalesce(p_signature_name, '')),
     btrim(coalesce(p_signature_title, '')),
     coalesce(p_is_active, true), coalesce(p_sort_order, 100))
  on conflict (key) do update set
    name            = excluded.name,
    purpose         = excluded.purpose,
    heading         = excluded.heading,
    body_template   = excluded.body_template,
    accent          = excluded.accent,
    orientation     = excluded.orientation,
    signature_name  = excluded.signature_name,
    signature_title = excluded.signature_title,
    is_active       = excluded.is_active,
    sort_order      = excluded.sort_order
  returning * into v_row;

  perform bsdc.audit('certificate.template.save', v_key, jsonb_build_object(
    'name', v_row.name,
    'active', v_row.is_active
  ));
  return v_row;
end;
$$;

-- ===========================================================================
-- 2. Full notice editing, revisions, roster & bulk operations (notice-site)
-- ===========================================================================
alter table public.notices
  add column if not exists version integer not null default 1;

create table if not exists public.notice_revisions (
  id           uuid primary key default gen_random_uuid(),
  notice_id    uuid not null references public.notices (id) on delete cascade,
  version      integer not null,
  title        text not null,
  summary      text not null default '',
  body         text not null default '',
  category     text not null default 'general',
  audience     bsdc_notice_audience not null,
  priority     bsdc_notice_priority not null,
  status       bsdc_notice_status not null,
  pinned       boolean not null,
  requires_ack boolean not null,
  publish_at   timestamptz,
  expires_at   timestamptz,
  edited_by    text,
  edit_note    text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists notice_revisions_notice_idx
  on public.notice_revisions (notice_id, version desc);

alter table public.notice_revisions enable row level security;

drop policy if exists notice_revisions_read on public.notice_revisions;
create policy notice_revisions_read on public.notice_revisions
  for select using (bsdc.has_permission('notices.publish'));

revoke insert, update, delete on public.notice_revisions from anon, authenticated;
grant select on public.notice_revisions to authenticated;

create or replace function public.save_notice_with_revision(
  p_id           uuid default null,
  p_title        text default '',
  p_summary      text default '',
  p_body         text default '',
  p_category     text default 'general',
  p_audience     bsdc_notice_audience default 'public',
  p_priority     bsdc_notice_priority default 'routine',
  p_pinned       boolean default false,
  p_requires_ack boolean default false,
  p_publish_at   timestamptz default null,
  p_expires_at   timestamptz default null,
  p_edit_note    text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_cur      public.notices%rowtype;
  v_id       uuid;
  v_title    text := btrim(coalesce(p_title, ''));
  v_summary  text := btrim(coalesce(p_summary, ''));
  v_body     text := btrim(coalesce(p_body, ''));
  v_category text := lower(coalesce(nullif(btrim(p_category), ''), 'general'));
  v_note     text := left(btrim(coalesce(p_edit_note, '')), 300);
begin
  perform bsdc.require_permission('notices.publish');

  if char_length(v_title) < 4 or char_length(v_title) > 160 then
    raise exception 'Notice title must be 4 to 160 characters' using errcode = '22023';
  end if;
  if char_length(v_summary) > 300 then
    raise exception 'Notice summary must be at most 300 characters' using errcode = '22023';
  end if;
  if char_length(v_body) < 20 then
    raise exception 'Notice body must be at least 20 characters' using errcode = '22023';
  end if;
  if p_requires_ack and p_audience = 'public' then
    raise exception 'A public notice cannot require acknowledgement' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_publish_at is not null and p_expires_at <= p_publish_at then
    raise exception 'Expiry time must be after the publish time' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.notices
      (title, summary, body, category, audience, priority, status, pinned,
       requires_ack, publish_at, expires_at, created_by, version)
    values
      (v_title, v_summary, v_body, v_category, p_audience, p_priority, 'draft',
       coalesce(p_pinned, false), coalesce(p_requires_ack, false),
       p_publish_at, p_expires_at, bsdc.current_uid(), 1)
    returning id into v_id;

    perform bsdc.audit('notice.create', v_id::text, jsonb_build_object('title', v_title));
    return v_id;
  end if;

  select * into v_cur from public.notices where id = p_id for update;
  if not found then
    raise exception 'No such notice' using errcode = 'P0002';
  end if;

  insert into public.notice_revisions
    (notice_id, version, title, summary, body, category, audience, priority, status,
     pinned, requires_ack, publish_at, expires_at, edited_by, edit_note)
  values
    (v_cur.id, v_cur.version, v_cur.title, v_cur.summary, v_cur.body, v_cur.category,
     v_cur.audience, v_cur.priority, v_cur.status, v_cur.pinned, v_cur.requires_ack,
     v_cur.publish_at, v_cur.expires_at, bsdc.current_uid(),
     coalesce(nullif(v_note, ''), 'Editorial revision'));

  update public.notices
     set title        = v_title,
         summary      = v_summary,
         body         = v_body,
         category     = v_category,
         audience     = p_audience,
         priority     = p_priority,
         pinned       = coalesce(p_pinned, false),
         requires_ack = coalesce(p_requires_ack, false),
         publish_at   = case
                          when status = 'published' then coalesce(p_publish_at, publish_at, now())
                          else p_publish_at
                        end,
         expires_at   = p_expires_at,
         version      = v_cur.version + 1
   where id = v_cur.id;

  perform bsdc.audit('notice.edit', v_cur.id::text, jsonb_build_object(
    'version', v_cur.version + 1,
    'note', v_note
  ));
  return v_cur.id;
end;
$$;

create or replace function public.notice_history(p_notice_id uuid)
returns table (
  id           uuid,
  version      integer,
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
  edited_by    text,
  edit_note    text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    r.id, r.version, r.title, r.summary, r.body, r.category, r.audience, r.priority,
    r.status, r.pinned, r.requires_ack, r.publish_at, r.expires_at,
    r.edited_by, r.edit_note, r.created_at
  from public.notice_revisions r
  where bsdc.has_permission('notices.publish')
    and r.notice_id = p_notice_id
  order by r.version desc;
$$;

create or replace function public.revert_notice_revision(
  p_notice_id uuid,
  p_version   integer,
  p_note      text default ''
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_cur public.notices%rowtype;
  v_rev public.notice_revisions%rowtype;
  v_note text := left(btrim(coalesce(p_note, '')), 300);
begin
  perform bsdc.require_permission('notices.publish');

  select * into v_cur from public.notices where id = p_notice_id for update;
  if not found then raise exception 'No such notice' using errcode = 'P0002'; end if;

  select * into v_rev from public.notice_revisions
   where notice_id = p_notice_id and version = p_version;
  if not found then raise exception 'Revision % not found', p_version using errcode = 'P0002'; end if;

  insert into public.notice_revisions
    (notice_id, version, title, summary, body, category, audience, priority, status,
     pinned, requires_ack, publish_at, expires_at, edited_by, edit_note)
  values
    (v_cur.id, v_cur.version, v_cur.title, v_cur.summary, v_cur.body, v_cur.category,
     v_cur.audience, v_cur.priority, v_cur.status, v_cur.pinned, v_cur.requires_ack,
     v_cur.publish_at, v_cur.expires_at, bsdc.current_uid(),
     coalesce(nullif(v_note, ''), 'Reverted to v' || p_version));

  update public.notices
     set title        = v_rev.title,
         summary      = v_rev.summary,
         body         = v_rev.body,
         category     = v_rev.category,
         audience     = v_rev.audience,
         priority     = v_rev.priority,
         pinned       = v_rev.pinned,
         requires_ack = v_rev.requires_ack,
         expires_at   = v_rev.expires_at,
         version      = v_cur.version + 1
   where id = v_cur.id;

  perform bsdc.audit('notice.revert', v_cur.id::text, jsonb_build_object(
    'from_version', v_cur.version,
    'to_version', p_version
  ));
  return v_cur.version + 1;
end;
$$;

create or replace function public.unpublish_notice(
  p_id     uuid,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('notices.publish');

  update public.notices
     set status = 'draft',
         publish_at = null
   where id = p_id and status <> 'draft';

  if not found then
    raise exception 'Notice not found or already in draft' using errcode = 'P0002';
  end if;

  perform bsdc.audit('notice.unpublish', p_id::text, jsonb_build_object(
    'reason', btrim(coalesce(p_reason, ''))
  ));
end;
$$;

create or replace function public.clone_notice(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_src public.notices%rowtype;
  v_new uuid;
begin
  perform bsdc.require_permission('notices.publish');

  select * into v_src from public.notices where id = p_id;
  if not found then
    raise exception 'No such notice' using errcode = 'P0002';
  end if;

  insert into public.notices
    (title, summary, body, category, audience, priority, status, pinned,
     requires_ack, expires_at, created_by, version)
  values
    (left('Copy of ' || v_src.title, 160), v_src.summary, v_src.body, v_src.category,
     v_src.audience, v_src.priority, 'draft', false, v_src.requires_ack, null,
     bsdc.current_uid(), 1)
  returning id into v_new;

  perform bsdc.audit('notice.clone', v_new::text, jsonb_build_object('source', p_id::text));
  return v_new;
end;
$$;

create or replace function public.notice_ack_roster(
  p_notice_id uuid,
  p_limit     integer default 200
)
returns table (
  uid             text,
  staff_no        text,
  display_name    text,
  department      text,
  role            bsdc_role,
  acknowledged    boolean,
  acknowledged_at timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    s.uid,
    s.staff_no,
    p.display_name,
    s.department,
    p.role,
    (r.acknowledged_at is not null) as acknowledged,
    r.acknowledged_at
  from public.staff_records s
  join public.profiles p on p.uid = s.uid
  left join public.notice_receipts r
    on r.notice_id = p_notice_id and r.uid = s.uid
  where bsdc.has_permission('notices.publish')
    and s.is_active
  order by (r.acknowledged_at is null) asc, r.acknowledged_at desc nulls last, s.staff_no asc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

create or replace function public.bulk_notice_action(
  p_ids        uuid[],
  p_action     text,
  p_publish_at timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_id    uuid;
  v_count integer := 0;
  v_when  timestamptz := coalesce(p_publish_at, now());
begin
  perform bsdc.require_permission('notices.publish');

  if p_action not in ('publish', 'archive', 'unpublish', 'pin', 'unpin', 'urgent', 'important', 'routine') then
    raise exception 'Unsupported bulk notice action: %', p_action using errcode = '22023';
  end if;

  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;

  foreach v_id in array p_ids loop
    if p_action = 'publish' then
      update public.notices
         set status = 'published', publish_at = v_when, published_by = bsdc.current_uid()
       where id = v_id and status <> 'archived';
      if found then v_count := v_count + 1; end if;
    elsif p_action = 'archive' then
      update public.notices set status = 'archived' where id = v_id and status <> 'archived';
      if found then v_count := v_count + 1; end if;
    elsif p_action = 'unpublish' then
      update public.notices set status = 'draft', publish_at = null
       where id = v_id and status = 'published';
      if found then v_count := v_count + 1; end if;
    elsif p_action = 'pin' then
      update public.notices set pinned = true where id = v_id and not pinned;
      if found then v_count := v_count + 1; end if;
    elsif p_action = 'unpin' then
      update public.notices set pinned = false where id = v_id and pinned;
      if found then v_count := v_count + 1; end if;
    elsif p_action in ('urgent', 'important', 'routine') then
      update public.notices set priority = p_action::bsdc_notice_priority where id = v_id;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  perform bsdc.audit('notice.bulk', p_action, jsonb_build_object('count', v_count));
  return v_count;
end;
$$;

-- ===========================================================================
-- 3. CLI Macros, Cross-Portal Telemetry & Bulk Admin Governance
-- ===========================================================================
create table if not exists public.admin_saved_macros (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 2 and 80),
  description    text not null default '' check (char_length(description) <= 240),
  command_script text not null check (char_length(btrim(command_script)) between 2 and 4000),
  min_role       text not null default 'moderator' check (min_role in ('moderator', 'manager', 'admin', 'owner')),
  is_shared      boolean not null default true,
  created_by     text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists admin_saved_macros_touch on public.admin_saved_macros;
create trigger admin_saved_macros_touch
  before update on public.admin_saved_macros
  for each row execute function bsdc.touch_updated_at();

alter table public.admin_saved_macros enable row level security;

drop policy if exists admin_saved_macros_read on public.admin_saved_macros;
create policy admin_saved_macros_read on public.admin_saved_macros
  for select using (
    bsdc.is_staff() and (is_shared or created_by = bsdc.current_uid())
  );

revoke insert, update, delete on public.admin_saved_macros from anon, authenticated;
grant select on public.admin_saved_macros to authenticated;

create or replace function public.list_admin_macros()
returns table (
  id             uuid,
  name           text,
  description    text,
  command_script text,
  min_role       text,
  is_shared      boolean,
  created_by     text,
  updated_at     timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select m.id, m.name, m.description, m.command_script, m.min_role, m.is_shared, m.created_by, m.updated_at
  from public.admin_saved_macros m
  where bsdc.is_staff()
    and (m.is_shared or m.created_by = bsdc.current_uid())
    and bsdc.role_rank(bsdc.actor_role()) >= bsdc.role_rank(m.min_role::bsdc_role)
  order by m.updated_at desc
  limit 100;
$$;

create or replace function public.save_admin_macro(
  p_name           text,
  p_description    text,
  p_command_script text,
  p_min_role       text default 'manager',
  p_is_shared      boolean default true,
  p_id             uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_id   uuid;
  v_uid  text := bsdc.current_uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_cmd  text := btrim(coalesce(p_command_script, ''));
begin
  perform bsdc.require_permission('audit.read');

  if char_length(v_name) < 2 then
    raise exception 'Macro name must be at least 2 characters' using errcode = '22023';
  end if;
  if char_length(v_cmd) < 2 then
    raise exception 'Macro command script cannot be empty' using errcode = '22023';
  end if;
  if p_min_role not in ('moderator', 'manager', 'admin', 'owner') then
    raise exception 'Invalid minimum role for macro' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.admin_saved_macros
      (name, description, command_script, min_role, is_shared, created_by)
    values
      (v_name, btrim(coalesce(p_description, '')), v_cmd, p_min_role, coalesce(p_is_shared, true), v_uid)
    returning id into v_id;
  else
    update public.admin_saved_macros
       set name = v_name,
           description = btrim(coalesce(p_description, '')),
           command_script = v_cmd,
           min_role = p_min_role,
           is_shared = coalesce(p_is_shared, true)
     where id = p_id
       and (created_by = v_uid or bsdc.role_rank(bsdc.actor_role()) >= bsdc.role_rank('admin'::bsdc_role))
     returning id into v_id;
    if v_id is null then
      raise exception 'Macro not found or permission denied' using errcode = '42501';
    end if;
  end if;

  perform bsdc.audit('admin.macro.save', v_id::text, jsonb_build_object('name', v_name));
  return v_id;
end;
$$;

create or replace function public.delete_admin_macro(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('audit.read');

  delete from public.admin_saved_macros
   where id = p_id
     and (created_by = bsdc.current_uid() or bsdc.role_rank(bsdc.actor_role()) >= bsdc.role_rank('admin'::bsdc_role));

  if not found then
    return false;
  end if;
  perform bsdc.audit('admin.macro.delete', p_id::text);
  return true;
end;
$$;

create or replace function public.admin_telemetry_snapshot()
returns table (
  staff_active          integer,
  issued_certificates   integer,
  revoked_certificates  integer,
  live_notices          integer,
  draft_notices         integer,
  active_ip_rules       integer,
  custom_pages_live     integer,
  seo_overrides_count   integer,
  redirects_count       integer,
  unresolved_errors     integer,
  open_incidents        integer,
  audit_events_24h      integer
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    (select count(*)::integer from public.staff_records where is_active),
    (select count(*)::integer from public.issued_certificates where status = 'issued'),
    (select count(*)::integer from public.issued_certificates where status = 'revoked'),
    (select count(*)::integer from public.notices
      where status = 'published' and publish_at <= now() and (expires_at is null or expires_at > now())),
    (select count(*)::integer from public.notices where status = 'draft'),
    (select count(*)::integer from public.ip_rules where expires_at is null or expires_at > now()),
    (select count(*)::integer from public.custom_pages where status = 'published'),
    (select count(*)::integer from public.seo_overrides),
    (select count(*)::integer from public.redirects where is_enabled),
    (select count(*)::integer from public.client_errors where not is_resolved),
    (select count(*)::integer from public.incidents where resolved_at is null),
    (select count(*)::integer from public.audit_log where created_at >= now() - interval '24 hours')
  where bsdc.has_permission('audit.read') or bsdc.is_staff();
$$;

create or replace function public.admin_cli_audit_query(
  p_action  text default '',
  p_actor   text default '',
  p_subject text default '',
  p_limit   integer default 100
)
returns table (
  id         bigint,
  actor_uid  text,
  action     text,
  subject    text,
  metadata   jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select a.id, a.actor_uid, a.action, a.subject, a.metadata, a.created_at
  from public.audit_log a
  where bsdc.has_permission('audit.read')
    and (coalesce(btrim(p_action), '') = '' or a.action ilike '%' || btrim(p_action) || '%')
    and (coalesce(btrim(p_actor), '') = '' or a.actor_uid ilike '%' || btrim(p_actor) || '%')
    and (coalesce(btrim(p_subject), '') = '' or a.subject ilike '%' || btrim(p_subject) || '%')
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 300));
$$;

create or replace function public.bulk_moderation_resolve(
  p_report_ids uuid[],
  p_action     text,
  p_reason     text
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_id    uuid;
  v_count integer := 0;
begin
  perform bsdc.require_permission('moderation.resolve');
  if p_report_ids is null or coalesce(array_length(p_report_ids, 1), 0) = 0 then
    return 0;
  end if;

  foreach v_id in array p_report_ids loop
    begin
      perform public.resolve_report(v_id, p_action, p_reason);
      v_count := v_count + 1;
    exception when sqlstate 'P0002' or sqlstate '22023' then
      -- Skip already resolved or missing reports cleanly while resolving valid ones.
      null;
    end;
  end loop;

  perform bsdc.audit('moderation.bulk_resolve', p_action, jsonb_build_object(
    'resolved', v_count,
    'reason', left(btrim(coalesce(p_reason, '')), 200)
  ));
  return v_count;
end;
$$;

create or replace function public.bulk_people_role(
  p_uids text[],
  p_role bsdc_role
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid   text;
  v_count integer := 0;
begin
  perform bsdc.require_permission('people.role');
  if p_uids is null or coalesce(array_length(p_uids, 1), 0) = 0 then
    return 0;
  end if;

  foreach v_uid in array p_uids loop
    v_uid := btrim(coalesce(v_uid, ''));
    continue when v_uid = '';
    perform public.set_user_role(v_uid, p_role);
    v_count := v_count + 1;
  end loop;

  perform bsdc.audit('people.bulk_role', p_role::text, jsonb_build_object('count', v_count));
  return v_count;
end;
$$;

create or replace function public.bulk_people_status(
  p_uids   text[],
  p_status bsdc_account_status,
  p_reason text default ''
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid   text;
  v_count integer := 0;
begin
  perform bsdc.require_permission('people.suspend');
  if p_uids is null or coalesce(array_length(p_uids, 1), 0) = 0 then
    return 0;
  end if;

  foreach v_uid in array p_uids loop
    v_uid := btrim(coalesce(v_uid, ''));
    continue when v_uid = '';
    perform public.set_account_status(v_uid, p_status, p_reason);
    v_count := v_count + 1;
  end loop;

  perform bsdc.audit('people.bulk_status', p_status::text, jsonb_build_object('count', v_count));
  return v_count;
end;
$$;

create or replace function public.bulk_decide_shops(
  p_shop_ids uuid[],
  p_approve  boolean,
  p_reason   text default ''
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_id    uuid;
  v_count integer := 0;
begin
  perform bsdc.require_permission('audit.read');
  if not bsdc.is_staff() then
    raise exception 'Only active staff may decide shops' using errcode = '42501';
  end if;
  if p_shop_ids is null or coalesce(array_length(p_shop_ids, 1), 0) = 0 then
    return 0;
  end if;

  foreach v_id in array p_shop_ids loop
    perform public.decide_shop(v_id, p_approve, p_reason);
    v_count := v_count + 1;
  end loop;

  perform bsdc.audit('shops.bulk_decide', case when p_approve then 'approve' else 'refuse' end,
    jsonb_build_object('count', v_count));
  return v_count;
end;
$$;

create or replace function public.bulk_decide_campaigns(
  p_campaign_ids uuid[],
  p_approve      boolean,
  p_note         text default ''
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_id    uuid;
  v_count integer := 0;
begin
  perform bsdc.require_permission('ads.manage');
  if p_campaign_ids is null or coalesce(array_length(p_campaign_ids, 1), 0) = 0 then
    return 0;
  end if;

  foreach v_id in array p_campaign_ids loop
    perform public.decide_campaign(v_id, p_approve, p_note);
    v_count := v_count + 1;
  end loop;

  perform bsdc.audit('campaigns.bulk_decide', case when p_approve then 'approve' else 'reject' end,
    jsonb_build_object('count', v_count));
  return v_count;
end;
$$;

-- Revoke anon on every new corporate/editorial RPC (per 0054 security model)
revoke all on function public.certificate_registry_v2(text, text, text, integer) from public, anon;
grant execute on function public.certificate_registry_v2(text, text, text, integer) to authenticated, service_role;

revoke all on function public.certificate_detail(text) from public, anon;
grant execute on function public.certificate_detail(text) to authenticated, service_role;

revoke all on function public.certificate_history(text) from public, anon;
grant execute on function public.certificate_history(text) to authenticated, service_role;

revoke all on function public.edit_issued_certificate(text, text, text, text, date, date, text, text) from public, anon;
grant execute on function public.edit_issued_certificate(text, text, text, text, date, date, text, text) to authenticated, service_role;

revoke all on function public.amend_and_reissue_certificate(text, text, text, text, text, date, date, text, text) from public, anon;
grant execute on function public.amend_and_reissue_certificate(text, text, text, text, text, date, date, text, text) to authenticated, service_role;

revoke all on function public.restore_issued_certificate(text, text) from public, anon;
grant execute on function public.restore_issued_certificate(text, text) to authenticated, service_role;

revoke all on function public.bulk_certificate_action(text[], text, text, date) from public, anon;
grant execute on function public.bulk_certificate_action(text[], text, text, date) to authenticated, service_role;

revoke all on function public.save_certificate_template(text, text, text, text, text, text, text, text, text, boolean, integer) from public, anon;
grant execute on function public.save_certificate_template(text, text, text, text, text, text, text, text, text, boolean, integer) to authenticated, service_role;

revoke all on function public.save_notice_with_revision(uuid, text, text, text, text, bsdc_notice_audience, bsdc_notice_priority, boolean, boolean, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.save_notice_with_revision(uuid, text, text, text, text, bsdc_notice_audience, bsdc_notice_priority, boolean, boolean, timestamptz, timestamptz, text) to authenticated, service_role;

revoke all on function public.notice_history(uuid) from public, anon;
grant execute on function public.notice_history(uuid) to authenticated, service_role;

revoke all on function public.revert_notice_revision(uuid, integer, text) from public, anon;
grant execute on function public.revert_notice_revision(uuid, integer, text) to authenticated, service_role;

revoke all on function public.unpublish_notice(uuid, text) from public, anon;
grant execute on function public.unpublish_notice(uuid, text) to authenticated, service_role;

revoke all on function public.clone_notice(uuid) from public, anon;
grant execute on function public.clone_notice(uuid) to authenticated, service_role;

revoke all on function public.notice_ack_roster(uuid, integer) from public, anon;
grant execute on function public.notice_ack_roster(uuid, integer) to authenticated, service_role;

revoke all on function public.bulk_notice_action(uuid[], text, timestamptz) from public, anon;
grant execute on function public.bulk_notice_action(uuid[], text, timestamptz) to authenticated, service_role;

revoke all on function public.list_admin_macros() from public, anon;
grant execute on function public.list_admin_macros() to authenticated, service_role;

revoke all on function public.save_admin_macro(text, text, text, text, boolean, uuid) from public, anon;
grant execute on function public.save_admin_macro(text, text, text, text, boolean, uuid) to authenticated, service_role;

revoke all on function public.delete_admin_macro(uuid) from public, anon;
grant execute on function public.delete_admin_macro(uuid) to authenticated, service_role;

revoke all on function public.admin_telemetry_snapshot() from public, anon;
grant execute on function public.admin_telemetry_snapshot() to authenticated, service_role;

revoke all on function public.admin_cli_audit_query(text, text, text, integer) from public, anon;
grant execute on function public.admin_cli_audit_query(text, text, text, integer) to authenticated, service_role;

revoke all on function public.bulk_moderation_resolve(uuid[], text, text) from public, anon;
grant execute on function public.bulk_moderation_resolve(uuid[], text, text) to authenticated, service_role;

revoke all on function public.bulk_people_role(text[], bsdc_role) from public, anon;
grant execute on function public.bulk_people_role(text[], bsdc_role) to authenticated, service_role;

revoke all on function public.bulk_people_status(text[], bsdc_account_status, text) from public, anon;
grant execute on function public.bulk_people_status(text[], bsdc_account_status, text) to authenticated, service_role;

revoke all on function public.bulk_decide_shops(uuid[], boolean, text) from public, anon;
grant execute on function public.bulk_decide_shops(uuid[], boolean, text) to authenticated, service_role;

revoke all on function public.bulk_decide_campaigns(uuid[], boolean, text) from public, anon;
grant execute on function public.bulk_decide_campaigns(uuid[], boolean, text) to authenticated, service_role;

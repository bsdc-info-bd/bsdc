-- ---------------------------------------------------------------------------
-- 0091: Certificate edit, issuance, revocation, and template RPC validation
--
-- Aligns RPC validation with the table CHECK constraints and foreign keys on
-- public.issued_certificates and public.certificate_templates so operators and
-- callers receive clear 22023 parameter errors instead of raw SQLSTATE 23514
-- check violations or 23503 foreign-key failures ("The value did not pass a
-- database check.").
-- ---------------------------------------------------------------------------

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
    (v_code, p_template_key, v_uid, v_name, v_subject, v_body,
     v_date, p_expires_on, v_actor);

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
end;
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
         edit_reason    = left(v_reason, 300)
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
  v_code     text := upper(btrim(coalesce(p_code, '')));
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_new_code text;
begin
  perform bsdc.require_permission('certificates.issue');

  if char_length(v_reason) < 3 then
    raise exception 'Amending and reissuing requires a reason (minimum 3 characters)' using errcode = '22023';
  end if;

  select * into v_cur from public.issued_certificates
   where code = v_code for update;
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

create or replace function public.revoke_issued_certificate(p_code text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_code      text := upper(btrim(coalesce(p_code, '')));
  v_reason    text := btrim(coalesce(p_reason, ''));
  v_recipient text;
  v_actor     text := bsdc.current_uid();
begin
  perform bsdc.require_permission('certificates.issue');

  if v_reason = '' then
    raise exception 'A revocation needs a reason' using errcode = '22023';
  end if;
  if char_length(v_reason) > 300 then
    raise exception 'Revocation reason must be at most 300 characters' using errcode = '22023';
  end if;

  update public.issued_certificates
     set status        = 'revoked',
         revoked_at    = now(),
         revoke_reason = v_reason,
         updated_by    = v_actor
   where code = v_code and status = 'issued'
  returning recipient_uid into v_recipient;

  if not found then
    raise exception 'No certificate with that code is currently issued' using errcode = 'P0002';
  end if;

  if v_recipient is not null then
    perform bsdc.notify_path(
      v_recipient,
      v_actor,
      'certificate',
      null,
      null,
      left('Certificate revoked (' || v_code || '): ' || v_reason, 280),
      null,
      '/verify?code=' || v_code
    );
  end if;

  perform bsdc.audit('certificate.revoke', v_code, jsonb_build_object('reason', v_reason));
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
  v_key         text := lower(btrim(coalesce(p_key, '')));
  v_name        text := btrim(coalesce(p_name, ''));
  v_purpose     text := btrim(coalesce(p_purpose, ''));
  v_heading     text := btrim(coalesce(p_heading, ''));
  v_body        text := btrim(coalesce(p_body_template, ''));
  v_accent      text := lower(btrim(coalesce(p_accent, '')));
  v_orientation text := lower(btrim(coalesce(p_orientation, '')));
  v_sig_name    text := btrim(coalesce(p_signature_name, ''));
  v_sig_title   text := btrim(coalesce(p_signature_title, ''));
  v_row         public.certificate_templates;
begin
  perform bsdc.require_permission('settings.write');

  if v_key !~ '^[a-z][a-z0-9_-]{2,40}$' then
    raise exception 'Template key must be 3–41 lowercase letters, digits, hyphens, or underscores' using errcode = '22023';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Template name must be between 2 and 80 characters' using errcode = '22023';
  end if;
  if char_length(v_purpose) > 200 then
    raise exception 'Template purpose must be at most 200 characters' using errcode = '22023';
  end if;
  if char_length(v_heading) < 2 or char_length(v_heading) > 160 then
    raise exception 'Certificate heading must be between 2 and 160 characters' using errcode = '22023';
  end if;
  if char_length(v_body) > 1200 then
    raise exception 'Template body wording must be at most 1200 characters' using errcode = '22023';
  end if;
  if v_accent !~* '^#[0-9a-f]{6}$' then
    raise exception 'Accent must be a 6-digit hex color like #1b4332' using errcode = '22023';
  end if;
  if v_orientation not in ('landscape', 'portrait') then
    raise exception 'Orientation must be landscape or portrait' using errcode = '22023';
  end if;

  insert into public.certificate_templates
    (key, name, purpose, heading, body_template, accent, orientation,
     signature_name, signature_title, is_active, sort_order)
  values
    (v_key, v_name, v_purpose, v_heading, v_body, v_accent, v_orientation,
     v_sig_name, v_sig_title, coalesce(p_is_active, true), coalesce(p_sort_order, 100))
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
    'name', v_name,
    'active', v_row.is_active
  ));

  return v_row;
end;
$$;

revoke all on function public.issue_certificate(text, text, text, text, date, date, text) from public, anon;
grant execute on function public.issue_certificate(text, text, text, text, date, date, text) to authenticated, service_role;

revoke all on function public.edit_issued_certificate(text, text, text, text, date, date, text, text) from public, anon;
grant execute on function public.edit_issued_certificate(text, text, text, text, date, date, text, text) to authenticated, service_role;

revoke all on function public.amend_and_reissue_certificate(text, text, text, text, text, date, date, text, text) from public, anon;
grant execute on function public.amend_and_reissue_certificate(text, text, text, text, text, date, date, text, text) to authenticated, service_role;

revoke all on function public.revoke_issued_certificate(text, text) from public, anon;
grant execute on function public.revoke_issued_certificate(text, text) to authenticated, service_role;

revoke all on function public.save_certificate_template(text, text, text, text, text, text, text, text, text, boolean, integer) from public, anon;
grant execute on function public.save_certificate_template(text, text, text, text, text, text, text, text, text, boolean, integer) to authenticated, service_role;

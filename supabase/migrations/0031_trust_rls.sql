-- ---------------------------------------------------------------------------
-- Row level security for the trust empire.
--
-- The verification desk is the only public door, and it is a function, not a
-- table. Nobody can list the certificate registry; anybody can ask about one
-- code they are holding. That asymmetry is the whole design: verification
-- must not become enumeration.
-- ---------------------------------------------------------------------------

alter table public.certificate_templates enable row level security;
alter table public.certificates          enable row level security;
alter table public.notices               enable row level security;
alter table public.notice_receipts       enable row level security;
alter table public.verification_log      enable row level security;

-- ---------------------------- certificates ---------------------------------
drop policy if exists certificate_templates_read on public.certificate_templates;
create policy certificate_templates_read on public.certificate_templates
  for select using (bsdc.has_permission('certificates.issue'));

drop policy if exists certificate_templates_write on public.certificate_templates;
create policy certificate_templates_write on public.certificate_templates
  for all using (bsdc.has_permission('settings.write'))
  with check (bsdc.has_permission('settings.write'));

-- A holder may read their own certificate; staff who may issue may read the
-- registry. Everybody else uses the desk, one code at a time.
drop policy if exists certificates_read on public.certificates;
create policy certificates_read on public.certificates
  for select using (
    recipient_uid = bsdc.current_uid() or bsdc.has_permission('certificates.issue')
  );

-- No insert, update or delete policy. Certificates are issued and revoked by
-- their functions, which allocate the code, freeze the text and write the
-- audit row in one transaction.
revoke insert, update, delete on public.certificates from anon, authenticated;

-- ------------------------------- notices -----------------------------------
-- A published notice inside its window is readable by its audience. A draft
-- is readable only by the people who may publish it.
drop policy if exists notices_read on public.notices;
create policy notices_read on public.notices
  for select using (
    bsdc.has_permission('notices.publish')
    or (
      status = 'published'
      and publish_at is not null
      and publish_at <= now()
      and (expires_at is null or expires_at > now())
      and (
        audience = 'public'
        or (audience = 'members' and bsdc.current_uid() is not null)
        or (audience = 'staff' and bsdc.is_staff())
      )
    )
  );

-- Drafting and editing a notice is ordinary table work for an editor;
-- publishing and archiving are not, because they change who can see it.
drop policy if exists notices_draft on public.notices;
create policy notices_draft on public.notices
  for insert with check (bsdc.has_permission('notices.publish') and status = 'draft');

drop policy if exists notices_edit on public.notices;
create policy notices_edit on public.notices
  for update using (bsdc.has_permission('notices.publish'))
  with check (bsdc.has_permission('notices.publish'));

revoke delete on public.notices from anon, authenticated;
revoke update (code, status, publish_at, published_by) on public.notices from authenticated;

-- A receipt belongs to the person who gave it.
drop policy if exists notice_receipts_read on public.notice_receipts;
create policy notice_receipts_read on public.notice_receipts
  for select using (uid = bsdc.current_uid() or bsdc.has_permission('notices.publish'));

revoke insert, update, delete on public.notice_receipts from anon, authenticated;

-- --------------------------- verification log -------------------------------
-- Readable by the people who issue the documents being checked, so a sudden
-- run of failed checks on one code is visible. Written only by the desk.
drop policy if exists verification_log_read on public.verification_log;
create policy verification_log_read on public.verification_log
  for select using (
    bsdc.has_permission('certificates.issue') or bsdc.has_permission('notices.publish')
  );

revoke insert, update, delete on public.verification_log from anon, authenticated;

-- ------------------------------- grants ------------------------------------
grant select on public.notices to anon, authenticated;
grant insert, update on public.notices to authenticated;
grant select on public.certificate_templates, public.certificates,
                public.notice_receipts, public.verification_log to authenticated;
grant update, delete on public.certificate_templates to authenticated;

-- The public door: one function, one code at a time.
grant execute on function public.verify_code(text) to anon, authenticated;
grant execute on function public.notice_feed(integer) to anon, authenticated;

grant execute on function public.issue_certificate(text, text, text, text, date, date, text)
  to authenticated;
grant execute on function public.revoke_certificate(text, text) to authenticated;
grant execute on function public.certificate_registry(text, integer) to authenticated;
grant execute on function public.publish_notice(uuid, timestamptz) to authenticated;
grant execute on function public.archive_notice(uuid) to authenticated;
grant execute on function public.acknowledge_notice(uuid) to authenticated;
grant execute on function public.notice_registry(integer) to authenticated;
grant execute on function public.verification_activity(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security for the corporate network.
--
-- The seven staff apps read through definer functions that each check a
-- permission. Two things are deliberately public: the status page, because a
-- status page nobody can read during an outage is useless, and published
-- custom pages, because they are the public website.
-- ---------------------------------------------------------------------------

alter table public.site_config          enable row level security;
alter table public.site_config_history  enable row level security;
alter table public.custom_pages         enable row level security;
alter table public.page_sections        enable row level security;
alter table public.staff_records        enable row level security;
alter table public.ip_rules             enable row level security;
alter table public.ip_events            enable row level security;
alter table public.services             enable row level security;
alter table public.service_checks       enable row level security;
alter table public.incidents            enable row level security;
alter table public.incident_updates     enable row level security;
alter table public.corporate_channels   enable row level security;
alter table public.channel_members      enable row level security;

-- ---------------------------- configuration --------------------------------
drop policy if exists site_config_read on public.site_config;
create policy site_config_read on public.site_config
  for select using (is_public or bsdc.has_permission('settings.read'));

drop policy if exists site_config_history_read on public.site_config_history;
create policy site_config_history_read on public.site_config_history
  for select using (bsdc.has_permission('settings.read'));

-- No write policy anywhere: set_site_config() validates the value against the
-- type declared for the key and writes the history row in the same
-- transaction. A direct update would skip both.
revoke insert, update, delete on public.site_config from anon, authenticated;
revoke insert, update, delete on public.site_config_history from anon, authenticated;

-- ------------------------------- pages -------------------------------------
drop policy if exists custom_pages_read on public.custom_pages;
create policy custom_pages_read on public.custom_pages
  for select using (status = 'published' or bsdc.has_permission('settings.read'));

drop policy if exists custom_pages_write on public.custom_pages;
create policy custom_pages_write on public.custom_pages
  for all using (bsdc.has_permission('settings.write'))
  with check (bsdc.has_permission('settings.write'));

drop policy if exists page_sections_read on public.page_sections;
create policy page_sections_read on public.page_sections
  for select using (
    exists (
      select 1 from public.custom_pages p
      where p.id = page_id
        and (p.status = 'published' or bsdc.has_permission('settings.read'))
    )
  );

-- A section's payload may be edited in place, but its position may not: the
-- order is renumbered by move_page_section() under a lock, so two editors
-- cannot leave a page with two section threes.
drop policy if exists page_sections_edit on public.page_sections;
create policy page_sections_edit on public.page_sections
  for update using (bsdc.has_permission('settings.write'))
  with check (bsdc.has_permission('settings.write'));

drop policy if exists page_sections_delete on public.page_sections;
create policy page_sections_delete on public.page_sections
  for delete using (bsdc.has_permission('settings.write'));

revoke insert on public.page_sections from anon, authenticated;
revoke update ("position") on public.page_sections from authenticated;

-- --------------------------- staff records ---------------------------------
-- A staff member may read their own record; the rest needs people.read. The
-- card code and the CV are written only by the issuing functions.
drop policy if exists staff_records_read on public.staff_records;
create policy staff_records_read on public.staff_records
  for select using (uid = bsdc.current_uid() or bsdc.has_permission('people.read'));

revoke insert, update, delete on public.staff_records from anon, authenticated;

-- ----------------------------- ip intelligence -----------------------------
drop policy if exists ip_rules_read on public.ip_rules;
create policy ip_rules_read on public.ip_rules
  for select using (bsdc.has_permission('people.suspend'));

drop policy if exists ip_events_read on public.ip_events;
create policy ip_events_read on public.ip_events
  for select using (bsdc.has_permission('people.suspend'));

-- Rules change through set_ip_rule()/drop_ip_rule(), which write the audit
-- row. Events are written by the edge, never by a browser.
revoke insert, update, delete on public.ip_rules from anon, authenticated;
revoke insert, update, delete on public.ip_events from anon, authenticated;

-- ------------------------------- status ------------------------------------
-- Public on purpose. During an outage, the one page that must still answer is
-- the page that says there is an outage.
drop policy if exists services_read on public.services;
create policy services_read on public.services for select using (true);

drop policy if exists service_checks_read on public.service_checks;
create policy service_checks_read on public.service_checks for select using (true);

drop policy if exists incidents_read on public.incidents;
create policy incidents_read on public.incidents for select using (true);

drop policy if exists incident_updates_read on public.incident_updates;
create policy incident_updates_read on public.incident_updates for select using (true);

revoke insert, update, delete on public.services from anon, authenticated;
revoke insert, update, delete on public.service_checks from anon, authenticated;
revoke insert, update, delete on public.incidents from anon, authenticated;
revoke insert, update, delete on public.incident_updates from anon, authenticated;

-- ---------------------------- corporate chat -------------------------------
drop policy if exists corporate_channels_read on public.corporate_channels;
create policy corporate_channels_read on public.corporate_channels
  for select using (
    bsdc.has_permission('corporate.chat')
    and bsdc.role_rank(bsdc.actor_role()) >= bsdc.role_rank(min_role)
  );

drop policy if exists channel_members_read on public.channel_members;
create policy channel_members_read on public.channel_members
  for select using (uid = bsdc.current_uid() or bsdc.has_permission('people.read'));

revoke insert, update, delete on public.corporate_channels from anon, authenticated;
revoke insert, update, delete on public.channel_members from anon, authenticated;

-- ------------------------------- grants ------------------------------------
grant select on public.site_config, public.custom_pages, public.page_sections,
                public.services, public.service_checks, public.incidents,
                public.incident_updates to anon, authenticated;
grant select on public.site_config_history, public.staff_records, public.ip_rules,
                public.ip_events, public.corporate_channels, public.channel_members
  to authenticated;
grant update, delete on public.custom_pages to authenticated;
grant update, delete on public.page_sections to authenticated;

grant execute on function public.site_config_list() to anon, authenticated;
grant execute on function public.published_page(citext) to anon, authenticated;
grant execute on function public.service_uptime(integer) to anon, authenticated;
grant execute on function public.status_incidents(integer) to anon, authenticated;

grant execute on function public.set_site_config(text, jsonb) to authenticated;
grant execute on function public.revert_site_config(bigint) to authenticated;
grant execute on function public.site_config_history_for(text, integer) to authenticated;
grant execute on function public.add_page_section(uuid, bsdc_section_kind, jsonb) to authenticated;
grant execute on function public.move_page_section(uuid, integer) to authenticated;
grant execute on function public.upsert_staff_record(
  text, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.issue_staff_card(text) to authenticated;
grant execute on function public.staff_directory(text) to authenticated;
grant execute on function public.ip_decision(inet) to authenticated;
grant execute on function public.ip_activity(integer, integer) to authenticated;
grant execute on function public.set_ip_rule(cidr, bsdc_ip_rule_kind, text, integer)
  to authenticated;
grant execute on function public.drop_ip_rule(uuid) to authenticated;
grant execute on function public.record_service_check(text, boolean, integer) to authenticated;
grant execute on function public.open_incident(text, text, bsdc_incident_impact, text)
  to authenticated;
grant execute on function public.resolve_incident(uuid, text) to authenticated;
grant execute on function public.my_channels() to authenticated;

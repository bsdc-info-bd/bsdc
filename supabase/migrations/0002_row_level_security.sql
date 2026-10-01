-- ---------------------------------------------------------------------------
-- BSDC row level security.
--
-- Default posture: deny. Every table below enables RLS and grants only the
-- narrowest policy that the product actually needs. The caller is identified
-- by bsdc.current_uid() (the Firebase "sub" claim); staff is read from the
-- "staff" custom claim.
-- ---------------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.reserved_usernames enable row level security;
alter table public.follows            enable row level security;
alter table public.blocks             enable row level security;
alter table public.media_assets       enable row level security;
alter table public.feature_flags      enable row level security;
alter table public.reports            enable row level security;
alter table public.audit_log          enable row level security;

-- --------------------------- profiles --------------------------------------
drop policy if exists profiles_read_public on public.profiles;
create policy profiles_read_public on public.profiles
  for select
  using (
    status = 'active'
    or uid = bsdc.current_uid()
    or bsdc.is_staff()
  );

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert
  with check (uid = bsdc.current_uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update
  using (uid = bsdc.current_uid() or bsdc.is_staff())
  with check (uid = bsdc.current_uid() or bsdc.is_staff());

-- Role, status and counters are never writable from the browser: the client
-- key is granted update on a column subset only.
revoke update on public.profiles from anon, authenticated;
grant update (
  username, display_name, bio, avatar_url, cover_url, location, website,
  skills, interests, language, onboarding_complete, notifications, privacy,
  last_seen_at
) on public.profiles to authenticated;

-- ----------------------- reserved_usernames ---------------------------------
drop policy if exists reserved_read_all on public.reserved_usernames;
create policy reserved_read_all on public.reserved_usernames
  for select using (true);

-- ---------------------------- follows ---------------------------------------
drop policy if exists follows_read_all on public.follows;
create policy follows_read_all on public.follows
  for select using (true);

drop policy if exists follows_insert_self on public.follows;
create policy follows_insert_self on public.follows
  for insert
  with check (
    follower_uid = bsdc.current_uid()
    and not exists (
      select 1 from public.blocks b
      where b.blocker_uid = follows.followee_uid
        and b.blocked_uid = bsdc.current_uid()
    )
  );

drop policy if exists follows_delete_self on public.follows;
create policy follows_delete_self on public.follows
  for delete using (follower_uid = bsdc.current_uid());

-- ----------------------------- blocks ---------------------------------------
drop policy if exists blocks_rw_self on public.blocks;
create policy blocks_rw_self on public.blocks
  for all
  using (blocker_uid = bsdc.current_uid() or bsdc.is_staff())
  with check (blocker_uid = bsdc.current_uid());

-- -------------------------- media_assets ------------------------------------
drop policy if exists media_read_all on public.media_assets;
create policy media_read_all on public.media_assets
  for select using (true);

drop policy if exists media_write_self on public.media_assets;
create policy media_write_self on public.media_assets
  for insert with check (owner_uid = bsdc.current_uid());

drop policy if exists media_delete_self on public.media_assets;
create policy media_delete_self on public.media_assets
  for delete using (owner_uid = bsdc.current_uid() or bsdc.is_staff());

-- ------------------------- feature_flags ------------------------------------
drop policy if exists flags_read_all on public.feature_flags;
create policy flags_read_all on public.feature_flags
  for select using (true);

drop policy if exists flags_write_staff on public.feature_flags;
create policy flags_write_staff on public.feature_flags
  for all
  using (bsdc.is_staff())
  with check (bsdc.is_staff());

-- ----------------------------- reports --------------------------------------
drop policy if exists reports_insert_self on public.reports;
create policy reports_insert_self on public.reports
  for insert with check (reporter_uid = bsdc.current_uid());

drop policy if exists reports_read_own_or_staff on public.reports;
create policy reports_read_own_or_staff on public.reports
  for select using (reporter_uid = bsdc.current_uid() or bsdc.is_staff());

drop policy if exists reports_update_staff on public.reports;
create policy reports_update_staff on public.reports
  for update using (bsdc.is_staff()) with check (bsdc.is_staff());

-- ---------------------------- audit_log -------------------------------------
-- Writes happen through security-definer functions and Pages Functions only.
drop policy if exists audit_read_staff on public.audit_log;
create policy audit_read_staff on public.audit_log
  for select using (bsdc.is_staff());

-- --------------------------- grants -----------------------------------------
grant usage on schema public, bsdc to anon, authenticated;
grant select on public.profiles, public.reserved_usernames, public.follows,
  public.media_assets, public.feature_flags to anon, authenticated;
grant insert on public.profiles, public.follows, public.blocks,
  public.media_assets, public.reports to authenticated;
grant delete on public.follows, public.blocks, public.media_assets to authenticated;
grant execute on function public.claim_username(citext) to authenticated;
grant execute on function bsdc.current_uid(), bsdc.current_role_name(), bsdc.is_staff()
  to anon, authenticated;

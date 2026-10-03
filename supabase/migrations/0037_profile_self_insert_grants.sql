-- ---------------------------------------------------------------------------
-- Close a self-serve privilege-escalation hole in public.profiles.
--
-- 0002 granted INSERT on public.profiles at the *table* level, which in
-- Postgres confers INSERT on every column present and future — including
-- `role`, `status`, `reputation` and the denormalised counters. The update
-- side had already been split into a column-limited grant, so the only open
-- path was INSERT, and it is open exactly once per member: the first row they
-- ever write (their own, enforced by the RLS check `uid = current_uid()`).
--
-- Proved exploitable end to end against a live database as role
-- `authenticated`: a brand-new member self-inserts their own profile with
-- `role = 'admin'` and, because corporate authorization is deliberately
-- DB-driven, `bsdc.actor_role()` then returns 'admin' and
-- `bsdc.has_permission('moderation.read')` / `bsdc.has_permission('people.read')`
-- flip to true. The member's id token is untouched; only the database row is
-- spoofed. (Member-facing staff gates that read the `staff` claim were not
-- affected — only the DB-driven corporate ones were.)
--
-- The fix is a tightening, not a loosening: no legitimate code path ever
-- INSERTs a privileged column. The first-sign-in bootstrap writes only
-- uid/username/display_name; onboarding edits the self-service fields;
-- role changes go through the security-definer admin RPC that runs as the
-- table owner and therefore needs no member grant on `role` at all.
--
-- This migration only revokes a privilege that was never meant to exist and
-- re-grants the exact self-service column list; nothing else changes, so it
-- applies cleanly twice to an empty database.
-- ---------------------------------------------------------------------------

-- Drop the table-level INSERT grant on profiles (this is what covered `role`
-- and the other owner-owned columns). The other tables that shared 0002's
-- statement keep their own table-level grant untouched: we only revoke on
-- public.profiles.
revoke insert on public.profiles from authenticated;

-- Re-grant INSERT on only the columns a member may ever supply for their own
-- row: their identity plus the same self-service fields onboarding is allowed
-- to write. Privileged/state columns — role, status, reputation, the follower
-- and post counters, email_verified, last_seen_at, the timestamps and the
-- precomputed search_vector — are system-owned and deliberately absent.
grant insert (
  uid,
  username,
  display_name,
  bio,
  avatar_url,
  cover_url,
  location,
  website,
  skills,
  interests,
  language,
  onboarding_complete,
  notifications,
  privacy
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Guard for the future: the audit's RLS proof asserts this by attempting the
-- escalation directly (expect a 42501). A column-limited grant is the right
-- shape here and no BEFORE trigger is added: a role-normalising trigger would
-- also fire for the security-definer admin RPC and for the one-time owner
-- bootstrap, where `is_staff()` claims are not present, and would silently
-- fight the legitimate role-change path. Constraining the grant is the
-- precise, lower-risk control.
-- ---------------------------------------------------------------------------

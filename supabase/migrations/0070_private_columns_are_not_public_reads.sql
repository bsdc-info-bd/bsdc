-- RLS protects rows, not individual columns. These secrets must not be
-- readable through raw-table APIs, even when their containing row is public.
-- Explicit allowlists ensure future columns are not exposed automatically.
revoke select on public.media_assets from public, anon, authenticated;
revoke select (delete_token) on public.media_assets from public, anon, authenticated;
grant select (
  id, owner_uid, provider, kind, url, thumb_url, width, height,
  bytes, mime_type, checksum, created_at
) on public.media_assets to anon, authenticated;

-- event_detail is the authorized route to join_url (host, going RSVP, staff).
-- Table reads retain directory fields, but SELECT * intentionally fails closed.
revoke select on public.events from public, anon, authenticated;
revoke select (join_url) on public.events from public, anon, authenticated;
grant select (
  id, slug, title, description, mode, venue, city, cover_url,
  starts_at, ends_at, timezone, capacity, host_uid, group_id, page_id,
  going_count, is_cancelled, created_at, updated_at
) on public.events to anon, authenticated;

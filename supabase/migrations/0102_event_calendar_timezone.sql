-- 0102: the event calendar returns each event's own time zone.
--
-- The calendar groups events by day and shows their times. Without the event's
-- zone the client could only guess, so a Dhaka evening event could land on the
-- previous day for a reader in another zone. Adds `timezone` as the last column.
-- Return types cannot change with create or replace, so the function is dropped
-- and recreated, with the same body and the same grants as 0011/0012. Idempotent.

drop function if exists public.event_calendar(integer);

create or replace function public.event_calendar(p_limit integer default 40)
returns table (
  id          uuid,
  slug        text,
  title       text,
  mode        bsdc_event_mode,
  venue       text,
  city        text,
  cover_url   text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  capacity    integer,
  going_count integer,
  group_id    uuid,
  page_id     uuid,
  my_status   bsdc_rsvp_status,
  timezone    text
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    e.id, e.slug::text, e.title, e.mode, e.venue, e.city, e.cover_url,
    e.starts_at, e.ends_at, e.capacity, e.going_count, e.group_id, e.page_id,
    r.status, e.timezone
  from public.events e
  left join public.event_rsvps r on r.event_id = e.id and r.uid = bsdc.current_uid()
  where not e.is_cancelled
    and e.ends_at > now()
    and (e.group_id is null or bsdc.is_group_member(e.group_id, bsdc.current_uid())
         or exists (select 1 from public.groups g
                    where g.id = e.group_id and g.privacy = 'public'))
  order by e.starts_at
  limit greatest(1, least(p_limit, 100));
$$;

revoke all on function public.event_calendar(integer) from public;
grant execute on function public.event_calendar(integer) to anon, authenticated;

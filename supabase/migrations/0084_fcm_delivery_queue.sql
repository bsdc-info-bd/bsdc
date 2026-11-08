-- Durable per-notification/per-installation FCM delivery state. A lease makes
-- overlapping cron/manual runs safe; retries are bounded and never leak tokens.
create table if not exists public.fcm_delivery_attempts (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  device_id uuid not null references public.fcm_devices(id) on delete cascade,
  attempts integer not null default 0 check (attempts between 0 and 20),
  lease_until timestamptz,
  retry_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  last_status text not null default '',
  updated_at timestamptz not null default now(),
  primary key(notification_id, device_id)
);
create index if not exists fcm_attempts_due_idx on public.fcm_delivery_attempts(retry_at, lease_until)
  where delivered_at is null and failed_at is null;
alter table public.fcm_delivery_attempts enable row level security;
revoke all on public.fcm_delivery_attempts from anon, authenticated;
drop policy if exists fcm_delivery_attempts_deny_direct_access on public.fcm_delivery_attempts;
create policy fcm_delivery_attempts_deny_direct_access on public.fcm_delivery_attempts
  for all to anon, authenticated using (false) with check (false);

create or replace function public.fcm_claim_pending(p_secret text, p_limit integer default 200)
returns table(
  notification_id uuid, device_id uuid, token text, language text, kind text,
  actor_name text, path text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  if not bsdc.push_secret_matches(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with candidates as (
    select n.id as n_id, d.id as d_id
    from public.notifications n
    join public.profiles recipient on recipient.uid = n.uid and recipient.status = 'active'
    join public.fcm_devices d on d.uid = n.uid
    left join public.fcm_delivery_attempts a on a.notification_id = n.id and a.device_id = d.id
    where n.created_at > now() - interval '72 hours'
      and n.created_at <= now()
      and n.kind <> 'moderation'
      and (a.notification_id is null or (a.delivered_at is null and a.failed_at is null
        and a.attempts < 6 and (a.lease_until is null or a.lease_until < now())
        and (a.retry_at is null or a.retry_at <= now())))
    order by n.created_at asc, d.id
    limit v_limit
    for update of n, d skip locked
  ), claimed as (
    insert into public.fcm_delivery_attempts(notification_id, device_id, attempts, lease_until, retry_at, updated_at)
    select n_id, d_id, 1, now() + interval '2 minutes', null, now() from candidates
    on conflict(notification_id, device_id) do update set
      attempts = fcm_delivery_attempts.attempts + 1,
      lease_until = now() + interval '2 minutes',
      retry_at = null,
      updated_at = now()
    where fcm_delivery_attempts.delivered_at is null
      and fcm_delivery_attempts.failed_at is null
      and fcm_delivery_attempts.attempts < 6
      and (fcm_delivery_attempts.lease_until is null or fcm_delivery_attempts.lease_until < now())
      and (fcm_delivery_attempts.retry_at is null or fcm_delivery_attempts.retry_at <= now())
    returning notification_id, device_id
  )
  select n.id, d.id, d.token, d.language, n.kind::text,
    coalesce(actor.display_name, ''),
    case when n.conversation_id is not null then '/messages/' || n.conversation_id::text
      when n.kind = 'follow' and actor.username is not null then '/@' || actor.username::text
      when post.slug is not null then '/p/' || post.slug
      else '/notifications' end,
    n.created_at
  from claimed c
  join public.notifications n on n.id = c.notification_id
  join public.fcm_devices d on d.id = c.device_id
  left join public.profiles actor on actor.uid = n.actor_uid
  left join public.posts post on post.id = n.post_id;
end;
$$;

create or replace function public.fcm_finish_delivery(
  p_secret text, p_notification_id uuid, p_device_id uuid, p_outcome text
) returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare v_attempts integer;
begin
  if not bsdc.push_secret_matches(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_outcome not in ('sent', 'invalid', 'retry', 'failed') then raise exception 'invalid outcome' using errcode = '22023'; end if;
  select attempts into v_attempts from public.fcm_delivery_attempts
    where notification_id = p_notification_id and device_id = p_device_id for update;
  if not found then return; end if;
  update public.fcm_delivery_attempts set
    lease_until = null,
    delivered_at = case when p_outcome = 'sent' then now() else delivered_at end,
    failed_at = case when p_outcome in ('invalid', 'failed') or (p_outcome = 'retry' and v_attempts >= 6) then now() else failed_at end,
    retry_at = case when p_outcome = 'retry' and v_attempts < 6 then now() + make_interval(secs => least(3600::double precision, 30 * power(2::double precision, greatest(v_attempts - 1, 0)::double precision))) else null end,
    last_status = p_outcome,
    updated_at = now()
  where notification_id = p_notification_id and device_id = p_device_id;
  if p_outcome = 'invalid' then delete from public.fcm_devices where id = p_device_id; end if;
end;
$$;

revoke all on function public.fcm_claim_pending(text, integer) from public;
revoke all on function public.fcm_finish_delivery(text, uuid, uuid, text) from public;
grant execute on function public.fcm_claim_pending(text, integer) to anon, authenticated;
grant execute on function public.fcm_finish_delivery(text, uuid, uuid, text) to anon, authenticated;

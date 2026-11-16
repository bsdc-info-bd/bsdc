-- 0093: every real ad click is counted and billed; spam is blocked per user.
--
-- Before: a click's unique bucket was the calendar day, so `ad_events_once`
-- silently dropped every click after the first one per user per creative per
-- day. Clicks were under-counted and under-billed.
--
-- After:
--   * Impressions keep their hourly dedupe (one view per user per hour).
--   * Every click gets its own bucket (`clock_timestamp()`), so each click is
--     a separate row, a separate stat, and a separate charge.
--   * Spam guard, per identity (member uid, or verified guest viewer token)
--     and per creative:
--       - double_tap : a second click within 2 seconds of the previous one
--       - hourly_cap : more than 30 clicks on one creative in the last hour
--       - daily_cap  : more than 300 clicks across all creatives in one day
--     Rejected clicks are not billed and are written to
--     `ad_event_rejections` so staff can audit abuse.
--   * Clicks by the same identity on the same creative are serialised with an
--     advisory lock, so rapid parallel taps cannot slip past the guard.

-- ---------------------------------------------------------------------------
-- 1. Rejection audit table (no client access; written by the RPC only)
-- ---------------------------------------------------------------------------
create table if not exists public.ad_event_rejections (
  id          uuid primary key default gen_random_uuid(),
  creative_id uuid references public.ad_creatives (id) on delete cascade,
  uid         text,
  viewer_token text not null default '',
  kind        bsdc_ad_event_kind not null,
  reason      text not null check (reason in ('double_tap', 'hourly_cap', 'daily_cap')),
  created_at  timestamptz not null default now()
);

create index if not exists ad_event_rejections_creative_idx
  on public.ad_event_rejections (creative_id, created_at desc);

alter table public.ad_event_rejections enable row level security;
revoke all on public.ad_event_rejections from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Every click counts; spam is rejected per identity
-- ---------------------------------------------------------------------------
create or replace function public.record_ad_event(
  p_creative_id  uuid,
  p_kind         bsdc_ad_event_kind,
  p_viewer_token text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid             text := bsdc.current_uid();
  v_token           text := case
    when bsdc.current_uid() is null then left(btrim(coalesce(p_viewer_token, '')), 80)
    else ''
  end;
  v_creative        public.ad_creatives%rowtype;
  v_campaign        public.ad_campaigns%rowtype;
  v_bucket          timestamptz;
  v_cost            integer;
  v_remaining       integer;
  v_daily_remaining integer;
  v_balance         bigint;
  v_last_click      timestamptz;
  v_hour_clicks     integer;
  v_day_clicks      integer;
  v_reject    text;
begin
  select * into v_creative from public.ad_creatives where id = p_creative_id;
  if not found or not v_creative.is_enabled then
    return false;
  end if;

  select * into v_campaign from public.ad_campaigns
  where id = v_creative.campaign_id
  for update;

  if not found or v_campaign.status <> 'active' or v_campaign.starts_at > now()
     or (v_campaign.ends_at is not null and v_campaign.ends_at <= now()) then
    return false;
  end if;

  -- Identity: a signed-in member, or a guest whose viewer token is long enough.
  if v_uid is null and char_length(v_token) < 8 then
    return false;
  end if;

  if p_kind = 'click' then
    -- A click must follow a recent impression for the same identity.
    if v_uid is not null then
      if not exists (
        select 1 from public.ad_events e
        where e.creative_id = p_creative_id and e.uid = v_uid and e.kind = 'impression'
          and e.created_at >= now() - interval '2 hours'
      ) then
        return false;
      end if;
    else
      if not exists (
        select 1 from public.ad_events e
        where e.creative_id = p_creative_id and e.uid is null and e.viewer_token = v_token
          and e.kind = 'impression' and e.created_at >= now() - interval '2 hours'
      ) then
        return false;
      end if;
    end if;

    -- Serialise this identity's clicks on this creative so parallel taps
    -- cannot all read "no recent click" at once.
    perform pg_advisory_xact_lock(hashtextextended(
      'bsdc.ad_click:' || p_creative_id::text || ':' || coalesce(v_uid, 'guest:' || v_token), 0
    ));

    if v_uid is not null then
      select max(e.created_at),
             count(*) filter (where e.created_at >= now() - interval '1 hour')
        into v_last_click, v_hour_clicks
        from public.ad_events e
       where e.creative_id = p_creative_id and e.uid = v_uid and e.kind = 'click'
         and e.created_at >= now() - interval '1 hour';
      select count(*) into v_day_clicks
        from public.ad_events e
       where e.uid = v_uid and e.kind = 'click'
         and e.created_at >= date_trunc('day', now());
    else
      select max(e.created_at),
             count(*) filter (where e.created_at >= now() - interval '1 hour')
        into v_last_click, v_hour_clicks
        from public.ad_events e
       where e.creative_id = p_creative_id and e.uid is null
         and e.viewer_token = v_token and e.kind = 'click'
         and e.created_at >= now() - interval '1 hour';
      select count(*) into v_day_clicks
        from public.ad_events e
       where e.uid is null and e.viewer_token = v_token and e.kind = 'click'
         and e.created_at >= date_trunc('day', now());
    end if;

    v_reject := null;
    if v_last_click is not null and now() - v_last_click < interval '2 seconds' then
      v_reject := 'double_tap';
    elsif v_hour_clicks >= 30 then
      v_reject := 'hourly_cap';
    elsif v_day_clicks >= 300 then
      v_reject := 'daily_cap';
    end if;

    if v_reject is not null then
      insert into public.ad_event_rejections (
        creative_id, uid, viewer_token, kind, reason
      ) values (
        p_creative_id, v_uid,
        case when v_uid is null then v_token else '' end,
        p_kind, v_reject
      );
      return false;
    end if;

    v_bucket := clock_timestamp();
  else
    v_bucket := date_trunc('hour', now());
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bsdc.ad_wallet:' || v_campaign.owner_uid, 0));
  select coalesce(sum(amount), 0) into v_balance from public.ad_wallet_entries
   where owner_uid = v_campaign.owner_uid;
  v_remaining := v_campaign.total_budget - v_campaign.spent;
  v_daily_remaining := case when v_campaign.daily_budget = 0 then v_remaining
    else greatest(0, v_campaign.daily_budget - bsdc.ad_spend_today(v_campaign.id)) end;

  if v_remaining <= 0 or v_daily_remaining <= 0 or v_balance <= 0 then
    return false;
  end if;

  v_cost := least(
    bsdc.ad_event_cost(v_campaign.pricing, v_campaign.bid, p_kind),
    v_remaining,
    v_daily_remaining,
    v_balance
  )::integer;

  begin
    insert into public.ad_events (
      creative_id, campaign_id, uid, viewer_token, kind, placement, cost, bucket
    ) values (
      p_creative_id, v_campaign.id, v_uid,
      case when v_uid is null and char_length(v_token) >= 8 then v_token else '' end,
      p_kind, v_creative.placement, v_cost, v_bucket
    );
  exception
    when unique_violation then
      return false;
  end;

  insert into public.ad_daily_stats (campaign_id, creative_id, day, impressions, clicks, spend)
  values (
    v_campaign.id, p_creative_id, current_date,
    case when p_kind = 'impression' then 1 else 0 end,
    case when p_kind = 'click' then 1 else 0 end,
    v_cost
  )
  on conflict (campaign_id, creative_id, day) do update
  set impressions = public.ad_daily_stats.impressions + excluded.impressions,
      clicks      = public.ad_daily_stats.clicks + excluded.clicks,
      spend       = public.ad_daily_stats.spend + excluded.spend;

  if v_cost > 0 then
    insert into public.ad_wallet_entries (owner_uid, campaign_id, kind, amount, memo)
    values (v_campaign.owner_uid, v_campaign.id, 'spend', -v_cost, v_campaign.name);

    update public.ad_campaigns
    set spent = spent + v_cost,
        status = case when spent + v_cost >= total_budget then 'completed' else status end
    where id = v_campaign.id;
  end if;

  return true;
end;
$$;

revoke all on function public.record_ad_event(uuid, bsdc_ad_event_kind, text) from public;
grant execute on function public.record_ad_event(uuid, bsdc_ad_event_kind, text) to anon, authenticated, service_role;

-- A shared advertising wallet is a ledger, not one separate balance per
-- campaign. Serialize charges and credits per owner, check caps at charge
-- time, and stop serving a campaign that no longer has any wallet balance.
set search_path = public, bsdc, extensions, pg_temp;

create or replace function public.topup_ad_wallet(
  p_owner_uid text, p_amount integer, p_reference text default ''
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_balance bigint;
  v_count integer;
  v_amount integer;
  v_reference text := btrim(coalesce(p_reference, ''));
begin
  perform bsdc.require_permission('ads.manage');
  if p_amount is null or p_amount <= 0 then
    raise exception 'A top-up must be a positive amount' using errcode = '22023';
  end if;
  if char_length(v_reference) > 100 then
    raise exception 'The payment reference is too long' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where uid = p_owner_uid) then
    raise exception 'No advertiser has that identifier' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('bsdc.ad_wallet:' || p_owner_uid, 0));
  -- A payment reference is an idempotency key for that wallet. The empty
  -- reference remains supported for old clients but the staff UI requires one.
  if v_reference <> '' then
    select count(*), min(amount) into v_count, v_amount from public.ad_wallet_entries
     where owner_uid = p_owner_uid and kind = 'topup' and reference = v_reference;
    if v_count > 0 then
      if v_count <> 1 or v_amount <> p_amount then
        raise exception 'That payment reference already has a different credit' using errcode = '22023';
      end if;
      select coalesce(sum(amount), 0) into v_balance from public.ad_wallet_entries where owner_uid = p_owner_uid;
      return v_balance::integer;
    end if;
  end if;
  insert into public.ad_wallet_entries (owner_uid, kind, amount, memo, reference)
  values (p_owner_uid, 'topup', p_amount, 'Wallet top-up', v_reference);
  select coalesce(sum(amount), 0) into v_balance from public.ad_wallet_entries where owner_uid = p_owner_uid;
  perform bsdc.audit('campaign.wallet.topup', p_owner_uid,
    jsonb_build_object('amount', p_amount, 'reference', v_reference));
  return v_balance::integer;
end;
$$;

create or replace function public.serve_ads(
  p_placement bsdc_ad_placement,
  p_limit     integer default 2
)
returns table (
  creative_id uuid,
  campaign_id uuid,
  headline    text,
  body        text,
  image_url   text,
  cta_label   text,
  target_url  text,
  placement   bsdc_ad_placement
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  with viewer as (
    select
      bsdc.current_uid() as uid,
      coalesce((select p.location from public.profiles p where p.uid = bsdc.current_uid()), '') as city
  )
  select
    c.id, c.campaign_id, c.headline, c.body, c.image_url, c.cta_label,
    c.target_url, c.placement
  from public.ad_creatives c
  join public.ad_campaigns a on a.id = c.campaign_id
  cross join viewer v
  where c.is_enabled
    and c.placement = p_placement
    and a.status = 'active'
    and a.starts_at <= now()
    and (a.ends_at is null or a.ends_at > now())
    and a.spent < a.total_budget
    -- All campaigns of an owner share one wallet, not a balance each.
    and coalesce((select sum(w.amount) from public.ad_wallet_entries w
                  where w.owner_uid = a.owner_uid), 0) > 0
    -- The daily cap is honoured at serve time, not only at charge time, so a
    -- capped campaign stops occupying inventory it cannot pay for.
    and (a.daily_budget = 0 or bsdc.ad_spend_today(a.id) < a.daily_budget)
    -- Targeting: an empty list means everyone, never nobody.
    and (cardinality(a.target_cities) = 0 or v.city = any (a.target_cities))
    and (
      cardinality(a.target_topics) = 0
      or exists (
        select 1 from public.profiles p
        where p.uid = v.uid and p.interests && a.target_topics
      )
    )
    -- Frequency cap: the same person is not shown one creative more than
    -- eight times in a day, however many times they reload.
    and (
      v.uid is null
      or (
        select count(*) from public.ad_events e
        where e.creative_id = c.id and e.uid = v.uid and e.kind = 'impression'
          and e.created_at >= date_trunc('day', now())
      ) < 8
    )
  order by bsdc.ad_event_cost(a.pricing, a.bid, 'impression') desc, random()
  limit greatest(1, least(coalesce(p_limit, 2), 5));
$$;

-- ---------------------------------------------------------------------------
-- Counting and charging. One function, because counting an event and paying
-- for it must be the same transaction or the books will not balance.
-- ---------------------------------------------------------------------------
create or replace function public.record_ad_event(
  p_creative_id uuid,
  p_kind        bsdc_ad_event_kind
)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid       text := bsdc.current_uid();
  v_creative  public.ad_creatives%rowtype;
  v_campaign  public.ad_campaigns%rowtype;
  v_bucket    timestamptz;
  v_cost      integer;
  v_remaining integer;
  v_daily_remaining integer;
  v_balance bigint;
begin
  select * into v_creative from public.ad_creatives where id = p_creative_id;
  if not found or not v_creative.is_enabled then
    return false;
  end if;

  -- The campaign row is locked before anything is counted, so two tabs
  -- reporting at once cannot both spend the last poisha of a budget.
  select * into v_campaign from public.ad_campaigns
  where id = v_creative.campaign_id
  for update;

  if not found or v_campaign.status <> 'active' or v_campaign.starts_at > now()
     or (v_campaign.ends_at is not null and v_campaign.ends_at <= now()) then
    return false;
  end if;

  -- An impression is counted at most once an hour per viewer, a click at most
  -- once a day; an anonymous reader is counted but never deduplicated by uid.
  v_bucket := case
    when p_kind = 'impression' then date_trunc('hour', now())
    else date_trunc('day', now())
  end;

  if p_kind = 'click' then
    -- A click without a preceding impression is not a click; it is someone
    -- calling the endpoint.
    if v_uid is null or not exists (
      select 1 from public.ad_events e
      where e.creative_id = p_creative_id and e.uid = v_uid and e.kind = 'impression'
        and e.created_at >= now() - interval '2 hours'
    ) then
      return false;
    end if;
  end if;

  -- Lock by owner, after the campaign row. Two different campaigns cannot
  -- both spend the same wallet balance; top-ups take this exact lock too.
  perform pg_advisory_xact_lock(hashtextextended('bsdc.ad_wallet:' || v_campaign.owner_uid, 0));
  select coalesce(sum(amount), 0) into v_balance from public.ad_wallet_entries
   where owner_uid = v_campaign.owner_uid;
  v_remaining := v_campaign.total_budget - v_campaign.spent;
  v_daily_remaining := case when v_campaign.daily_budget = 0 then v_remaining
    else greatest(0, v_campaign.daily_budget - bsdc.ad_spend_today(v_campaign.id)) end;
  -- Even free events cannot be counted after funding or a cap runs out.
  if v_remaining <= 0 or v_daily_remaining <= 0 or v_balance <= 0 then
    return false;
  end if;
  -- Retain the existing last-event policy: charge at most the remaining
  -- campaign budget, daily cap and wallet, never a negative balance.
  v_cost := least(bsdc.ad_event_cost(v_campaign.pricing, v_campaign.bid, p_kind),
                  v_remaining, v_daily_remaining, v_balance)::integer;

  begin
    insert into public.ad_events (creative_id, campaign_id, uid, kind, placement, cost, bucket)
    values (p_creative_id, v_campaign.id, v_uid, p_kind, v_creative.placement, v_cost, v_bucket);
  exception
    when unique_violation then
      -- Already counted in this bucket. Not an error, just nothing to do.
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
        -- The statement that spends the last poisha is the statement that
        -- closes the campaign. There is no sweep job to forget to run.
        status = case when spent + v_cost >= total_budget then 'completed' else status end
    where id = v_campaign.id;
  end if;

  return true;
end;
$$;


revoke all on function public.topup_ad_wallet(text, integer, text) from public, anon, authenticated;
grant execute on function public.topup_ad_wallet(text, integer, text) to authenticated, service_role;

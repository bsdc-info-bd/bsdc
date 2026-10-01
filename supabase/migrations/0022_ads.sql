-- ---------------------------------------------------------------------------
-- Advertising.
--
-- Three things decide whether an ad system is honest, and all three live in
-- Postgres here rather than in any screen:
--   1. The advertiser never states the price. A bid is stored once; every
--      charge is computed by the database from that bid and the event it is
--      charging for, inside the same transaction that records the event.
--   2. An event can only be counted once. Impressions are deduplicated per
--      viewer per hour, clicks per viewer per day, and a click is refused
--      unless that viewer was actually shown the creative first.
--   3. Money cannot be spent twice. The wallet is an append-only ledger, the
--      balance is summed under a lock, and a campaign that reaches its budget
--      is closed by the same statement that spends the last poisha.
--
-- Every amount is an integer number of poisha. There is no float anywhere.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_ad_status') then
    create type bsdc_ad_status as enum (
      'draft', 'pending_review', 'active', 'paused', 'rejected', 'completed'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_ad_placement') then
    create type bsdc_ad_placement as enum ('feed', 'sidebar', 'shop', 'search', 'article');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_ad_pricing') then
    create type bsdc_ad_pricing as enum ('cpm', 'cpc');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_ad_event_kind') then
    create type bsdc_ad_event_kind as enum ('impression', 'click');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_ad_wallet_kind') then
    create type bsdc_ad_wallet_kind as enum ('topup', 'spend', 'refund', 'adjustment');
  end if;
end;
$$;

-- ------------------------------ campaigns ----------------------------------
create table if not exists public.ad_campaigns (
  id             uuid primary key default gen_random_uuid(),
  owner_uid      text not null references public.profiles (uid) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 3 and 120),
  status         bsdc_ad_status not null default 'draft',
  pricing        bsdc_ad_pricing not null default 'cpm',
  -- Poisha per thousand impressions (cpm) or per click (cpc).
  bid            integer not null check (bid between 100 and 10000000),
  daily_budget   integer not null check (daily_budget between 0 and 1000000000),
  total_budget   integer not null check (total_budget between 1000 and 1000000000),
  spent          integer not null default 0 check (spent >= 0),
  starts_at      timestamptz not null default now(),
  ends_at        timestamptz,
  target_cities   text[] not null default '{}',
  target_topics   text[] not null default '{}',
  target_language text not null default 'any' check (target_language in ('any', 'bn', 'en')),
  review_note    text not null default '' check (char_length(review_note) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ad_campaigns_window check (ends_at is null or ends_at > starts_at),
  -- A daily cap above the total budget would be a cap in name only.
  constraint ad_campaigns_daily_cap check (daily_budget = 0 or daily_budget <= total_budget)
);

create index if not exists ad_campaigns_owner_idx on public.ad_campaigns (owner_uid, created_at desc);
create index if not exists ad_campaigns_live_idx on public.ad_campaigns (status, starts_at)
  where status = 'active';

drop trigger if exists ad_campaigns_touch on public.ad_campaigns;
create trigger ad_campaigns_touch before update on public.ad_campaigns
  for each row execute function bsdc.touch_updated_at();

-- ------------------------------ creatives ----------------------------------
create table if not exists public.ad_creatives (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  placement   bsdc_ad_placement not null default 'feed',
  headline    text not null check (char_length(btrim(headline)) between 3 and 80),
  body        text not null default '' check (char_length(body) <= 200),
  image_url   text not null default '' check (char_length(image_url) <= 500),
  cta_label   text not null default '' check (char_length(cta_label) <= 32),
  -- Only https destinations: an ad may not drop a reader onto plain http.
  target_url  text not null check (target_url ~ '^https://[^\s]{4,500}$'),
  is_enabled  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ad_creatives_campaign_idx on public.ad_creatives (campaign_id);
create index if not exists ad_creatives_placement_idx on public.ad_creatives (placement)
  where is_enabled;

drop trigger if exists ad_creatives_touch on public.ad_creatives;
create trigger ad_creatives_touch before update on public.ad_creatives
  for each row execute function bsdc.touch_updated_at();

-- -------------------------------- wallet -----------------------------------
-- Append only, exactly like the shop ledger. A top-up credits, a spend debits.
create table if not exists public.ad_wallet_entries (
  id          uuid primary key default gen_random_uuid(),
  owner_uid   text not null references public.profiles (uid) on delete cascade,
  campaign_id uuid references public.ad_campaigns (id) on delete set null,
  kind        bsdc_ad_wallet_kind not null,
  amount      integer not null,
  memo        text not null default '' check (char_length(memo) <= 200),
  reference   text not null default '' check (char_length(reference) <= 100),
  created_at  timestamptz not null default now(),
  constraint ad_wallet_direction check (
    (kind = 'topup' and amount > 0)
    or (kind = 'spend' and amount < 0)
    or (kind in ('refund', 'adjustment') and amount <> 0)
  )
);

create index if not exists ad_wallet_owner_idx
  on public.ad_wallet_entries (owner_uid, created_at desc);

-- -------------------------------- events -----------------------------------
-- One row per counted event. The bucket columns are what make a double count
-- impossible: they are part of a unique index, so a retry is a no-op.
create table if not exists public.ad_events (
  id          uuid primary key default gen_random_uuid(),
  creative_id uuid not null references public.ad_creatives (id) on delete cascade,
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  uid         text references public.profiles (uid) on delete set null,
  kind        bsdc_ad_event_kind not null,
  placement   bsdc_ad_placement not null,
  cost        integer not null default 0 check (cost >= 0),
  bucket      timestamptz not null,
  created_at  timestamptz not null default now()
);

create unique index if not exists ad_events_once
  on public.ad_events (creative_id, uid, kind, bucket) where uid is not null;
create index if not exists ad_events_campaign_idx
  on public.ad_events (campaign_id, created_at desc);

-- ------------------------------ daily stats --------------------------------
create table if not exists public.ad_daily_stats (
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  creative_id uuid not null references public.ad_creatives (id) on delete cascade,
  day         date not null,
  impressions integer not null default 0,
  clicks      integer not null default 0,
  spend       integer not null default 0,
  primary key (campaign_id, creative_id, day)
);

create index if not exists ad_daily_stats_day_idx on public.ad_daily_stats (day desc);

-- ---------------------------------------------------------------------------
-- Pricing. A cpm bid is per thousand impressions, so one impression costs a
-- thousandth of it; integer division truncates, and the client mirrors that
-- truncation exactly so the two never disagree about a number.
-- ---------------------------------------------------------------------------
create or replace function bsdc.ad_event_cost(
  p_pricing bsdc_ad_pricing,
  p_bid     integer,
  p_kind    bsdc_ad_event_kind
)
returns integer
language sql
immutable
as $$
  select case
    when p_pricing = 'cpm' and p_kind = 'impression' then p_bid / 1000
    when p_pricing = 'cpc' and p_kind = 'click' then p_bid
    else 0
  end;
$$;

-- The spend recorded against a campaign today, used for the daily cap.
create or replace function bsdc.ad_spend_today(p_campaign_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select coalesce(sum(spend), 0)::integer
  from public.ad_daily_stats
  where campaign_id = p_campaign_id and day = current_date;
$$;

-- ---------------------------------------------------------------------------
-- Wallet balance: summed from the ledger, never stored as a column that could
-- drift away from the rows that explain it.
-- ---------------------------------------------------------------------------
create or replace function public.ad_wallet_balance()
returns integer
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select coalesce(sum(amount), 0)::integer
  from public.ad_wallet_entries
  where owner_uid = bsdc.current_uid();
$$;

create or replace function public.topup_ad_wallet(
  p_owner_uid text,
  p_amount    integer,
  p_reference text default ''
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_balance integer;
begin
  -- Only staff may put money in: a top-up follows a payment the finance team
  -- has actually seen, never a button a stranger can press.
  if not bsdc.is_staff() then
    raise exception 'Only staff can credit an advertising wallet'
      using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'A top-up must be a positive amount' using errcode = '22023';
  end if;

  insert into public.ad_wallet_entries (owner_uid, kind, amount, memo, reference)
  values (p_owner_uid, 'topup', p_amount, 'Wallet top-up', coalesce(p_reference, ''));

  select coalesce(sum(amount), 0)::integer into v_balance
  from public.ad_wallet_entries where owner_uid = p_owner_uid;

  return v_balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- Campaign lifecycle. draft -> pending_review -> active/rejected, and an
-- active campaign may be paused, resumed, or completed when its money runs
-- out. A campaign cannot be made active by its owner.
-- ---------------------------------------------------------------------------
create or replace function public.create_campaign(
  p_name         text,
  p_pricing      bsdc_ad_pricing,
  p_bid          integer,
  p_total_budget integer,
  p_daily_budget integer default 0,
  p_starts_at    timestamptz default now(),
  p_ends_at      timestamptz default null,
  p_cities       text[] default '{}',
  p_topics       text[] default '{}',
  p_language     text default 'any'
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to create a campaign' using errcode = '42501';
  end if;

  insert into public.ad_campaigns (
    owner_uid, name, pricing, bid, total_budget, daily_budget,
    starts_at, ends_at, target_cities, target_topics, target_language
  )
  values (
    v_uid, btrim(p_name), p_pricing, p_bid, p_total_budget, coalesce(p_daily_budget, 0),
    coalesce(p_starts_at, now()), p_ends_at,
    coalesce(p_cities, '{}'), coalesce(p_topics, '{}'), coalesce(p_language, 'any')
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.add_creative(
  p_campaign_id uuid,
  p_placement   bsdc_ad_placement,
  p_headline    text,
  p_body        text,
  p_target_url  text,
  p_image_url   text default '',
  p_cta_label   text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_id  uuid;
begin
  if not exists (
    select 1 from public.ad_campaigns
    where id = p_campaign_id and owner_uid = v_uid
  ) then
    raise exception 'That campaign is not yours' using errcode = '42501';
  end if;

  insert into public.ad_creatives (
    campaign_id, placement, headline, body, target_url, image_url, cta_label
  )
  values (
    p_campaign_id, p_placement, btrim(p_headline), coalesce(p_body, ''),
    btrim(p_target_url), coalesce(p_image_url, ''), coalesce(p_cta_label, '')
  )
  returning id into v_id;

  -- Editing a live campaign sends it back for review: an approved ad is the
  -- ad that was approved, not whatever replaced it afterwards.
  update public.ad_campaigns
  set status = case when status = 'active' then 'pending_review' else status end
  where id = p_campaign_id;

  return v_id;
end;
$$;

create or replace function public.submit_campaign(p_campaign_id uuid)
returns bsdc_ad_status
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid       text := bsdc.current_uid();
  v_campaign  public.ad_campaigns%rowtype;
  v_balance   integer;
begin
  select * into v_campaign from public.ad_campaigns
  where id = p_campaign_id and owner_uid = v_uid
  for update;

  if not found then
    raise exception 'That campaign is not yours' using errcode = '42501';
  end if;
  if v_campaign.status not in ('draft', 'rejected', 'paused') then
    raise exception 'Only a draft campaign can be submitted' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.ad_creatives
    where campaign_id = p_campaign_id and is_enabled
  ) then
    raise exception 'A campaign needs at least one creative' using errcode = '22023';
  end if;

  -- The wallet must already cover the budget being promised. An advertiser
  -- cannot book inventory with money that does not exist.
  select coalesce(sum(amount), 0)::integer into v_balance
  from public.ad_wallet_entries where owner_uid = v_uid;

  if v_balance < v_campaign.total_budget - v_campaign.spent then
    raise exception 'Top up the wallet before submitting this budget'
      using errcode = '22023';
  end if;

  update public.ad_campaigns set status = 'pending_review', review_note = ''
  where id = p_campaign_id;

  return 'pending_review'::bsdc_ad_status;
end;
$$;

create or replace function public.decide_campaign(
  p_campaign_id uuid,
  p_approve     boolean,
  p_note        text default ''
)
returns bsdc_ad_status
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_status bsdc_ad_status;
  v_owner  text;
begin
  if not bsdc.is_staff() then
    raise exception 'Only staff can review campaigns' using errcode = '42501';
  end if;

  v_status := case when p_approve then 'active' else 'rejected' end;

  update public.ad_campaigns
  set status = v_status, review_note = coalesce(p_note, '')
  where id = p_campaign_id
  returning owner_uid into v_owner;

  if v_owner is null then
    raise exception 'No such campaign' using errcode = 'P0002';
  end if;

  perform bsdc.notify(v_owner, bsdc.current_uid(), 'moderation', null, null,
    case when p_approve then 'Your campaign is live' else 'Your campaign was not approved' end);

  return v_status;
end;
$$;

create or replace function public.set_campaign_paused(
  p_campaign_id uuid,
  p_paused      boolean
)
returns bsdc_ad_status
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid    text := bsdc.current_uid();
  v_status bsdc_ad_status;
begin
  select status into v_status from public.ad_campaigns
  where id = p_campaign_id and (owner_uid = v_uid or bsdc.is_staff())
  for update;

  if v_status is null then
    raise exception 'That campaign is not yours' using errcode = '42501';
  end if;
  -- Pausing is the one state change an owner may make, and only from a state
  -- that was already approved.
  if p_paused and v_status <> 'active' then
    raise exception 'Only a live campaign can be paused' using errcode = '22023';
  end if;
  if not p_paused and v_status <> 'paused' then
    raise exception 'Only a paused campaign can be resumed' using errcode = '22023';
  end if;

  v_status := case when p_paused then 'paused' else 'active' end;
  update public.ad_campaigns set status = v_status where id = p_campaign_id;
  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Serving. Security definer because eligibility depends on rows the viewer
-- may not read, but it returns only what a rendered ad needs: no bid, no
-- budget, no owner.
-- ---------------------------------------------------------------------------
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
set search_path = public, bsdc, pg_temp
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
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid       text := bsdc.current_uid();
  v_creative  public.ad_creatives%rowtype;
  v_campaign  public.ad_campaigns%rowtype;
  v_bucket    timestamptz;
  v_cost      integer;
  v_remaining integer;
begin
  select * into v_creative from public.ad_creatives where id = p_creative_id;
  if not found then
    return false;
  end if;

  -- The campaign row is locked before anything is counted, so two tabs
  -- reporting at once cannot both spend the last poisha of a budget.
  select * into v_campaign from public.ad_campaigns
  where id = v_creative.campaign_id
  for update;

  if v_campaign.status <> 'active' or v_campaign.starts_at > now()
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

  v_cost := bsdc.ad_event_cost(v_campaign.pricing, v_campaign.bid, p_kind);
  v_remaining := v_campaign.total_budget - v_campaign.spent;
  if v_cost > v_remaining then
    v_cost := v_remaining;
  end if;

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

-- ---------------------------------------------------------------------------
-- Advertiser read models.
-- ---------------------------------------------------------------------------
create or replace function public.my_campaigns(p_limit integer default 50)
returns table (
  id            uuid,
  name          text,
  status        bsdc_ad_status,
  pricing       bsdc_ad_pricing,
  bid           integer,
  total_budget  integer,
  daily_budget  integer,
  spent         integer,
  starts_at     timestamptz,
  ends_at       timestamptz,
  review_note   text,
  creative_count integer,
  impressions   integer,
  clicks        integer,
  spend_today   integer
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    a.id, a.name, a.status, a.pricing, a.bid, a.total_budget, a.daily_budget,
    a.spent, a.starts_at, a.ends_at, a.review_note,
    (select count(*)::integer from public.ad_creatives c where c.campaign_id = a.id),
    coalesce((select sum(s.impressions)::integer from public.ad_daily_stats s
              where s.campaign_id = a.id), 0),
    coalesce((select sum(s.clicks)::integer from public.ad_daily_stats s
              where s.campaign_id = a.id), 0),
    bsdc.ad_spend_today(a.id)
  from public.ad_campaigns a
  where a.owner_uid = bsdc.current_uid()
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

create or replace function public.campaign_creatives(p_campaign_id uuid)
returns table (
  id          uuid,
  placement   bsdc_ad_placement,
  headline    text,
  body        text,
  image_url   text,
  cta_label   text,
  target_url  text,
  is_enabled  boolean,
  impressions integer,
  clicks      integer,
  spend       integer
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    c.id, c.placement, c.headline, c.body, c.image_url, c.cta_label,
    c.target_url, c.is_enabled,
    coalesce((select sum(s.impressions)::integer from public.ad_daily_stats s
              where s.creative_id = c.id), 0),
    coalesce((select sum(s.clicks)::integer from public.ad_daily_stats s
              where s.creative_id = c.id), 0),
    coalesce((select sum(s.spend)::integer from public.ad_daily_stats s
              where s.creative_id = c.id), 0)
  from public.ad_creatives c
  join public.ad_campaigns a on a.id = c.campaign_id
  where c.campaign_id = p_campaign_id
    and (a.owner_uid = bsdc.current_uid() or bsdc.is_staff())
  order by c.created_at;
$$;

create or replace function public.campaign_daily(
  p_campaign_id uuid,
  p_days        integer default 14
)
returns table (day date, impressions integer, clicks integer, spend integer)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select s.day,
         sum(s.impressions)::integer,
         sum(s.clicks)::integer,
         sum(s.spend)::integer
  from public.ad_daily_stats s
  join public.ad_campaigns a on a.id = s.campaign_id
  where s.campaign_id = p_campaign_id
    and (a.owner_uid = bsdc.current_uid() or bsdc.is_staff())
    and s.day >= current_date - greatest(1, least(coalesce(p_days, 14), 90))
  group by s.day
  order by s.day;
$$;

create or replace function public.ad_wallet_history(p_limit integer default 50)
returns table (
  id         uuid,
  kind       bsdc_ad_wallet_kind,
  amount     integer,
  memo       text,
  reference  text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select w.id, w.kind, w.amount, w.memo, w.reference, w.created_at
  from public.ad_wallet_entries w
  where w.owner_uid = bsdc.current_uid()
  order by w.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

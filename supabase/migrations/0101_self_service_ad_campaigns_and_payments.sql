-- 0101: advertisers build their own campaign, then pay BSDC by bKash, the way
-- a marketplace vendor does.
--
-- The flow, and who may act at each step:
--   1. An advertiser fills the campaign form (name, pricing, bid, budget,
--      schedule, one creative) -> `ad_create_campaign` makes a DRAFT.
--   2. They send the budget to the BSDC bKash number (`ad_payment_instructions`)
--      and submit the sender number, account name and transaction ID
--      (`ad_submit_payment`). That leaves a PENDING payment request.
--   3. Finance (ads staff) checks the transaction and approves
--      (`ad_admin_decide_payment_request`). Approval credits the advertiser's
--      wallet with exactly the requested amount and tells the owner.
--   4. The advertiser sends the funded campaign for review
--      (`ad_owner_submit_campaign`), which needs wallet balance to cover the
--      budget. Staff then approve the creative as before (`decide_campaign`).
--
-- Nothing here lets an advertiser credit their own wallet, approve their own
-- payment, or make a campaign live. A transaction ID can be used once.

-- ---------------------------------------------------------------------------
-- 1. Payment requests
-- ---------------------------------------------------------------------------
create table if not exists public.ad_payment_requests (
  id              uuid primary key default gen_random_uuid(),
  owner_uid       text not null references public.profiles (uid) on delete cascade,
  campaign_id     uuid not null references public.ad_campaigns (id) on delete cascade,
  amount_poisha   integer not null check (amount_poisha > 0),
  sender_number   text not null check (sender_number ~ '^01[3-9][0-9]{8}$'),
  account_holder  text not null check (char_length(btrim(account_holder)) between 2 and 80),
  txn_id          text not null check (char_length(btrim(txn_id)) between 4 and 40),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note     text not null default '' check (char_length(review_note) <= 500),
  decided_by      text references public.profiles (uid) on delete set null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- A bKash or Nagad transaction ID can fund exactly one request, ever.
create unique index if not exists ad_payment_requests_txn_once
  on public.ad_payment_requests (lower(btrim(txn_id)));
-- One open request per campaign at a time.
create unique index if not exists ad_payment_requests_one_pending
  on public.ad_payment_requests (campaign_id) where status = 'pending';
create index if not exists ad_payment_requests_status_idx
  on public.ad_payment_requests (status, created_at);

-- Read and written only through the functions below, never directly.
alter table public.ad_payment_requests enable row level security;
revoke all on public.ad_payment_requests from public, anon, authenticated;
-- Reached only through the security-definer RPCs below, never directly (as 0099 does).
drop policy if exists ad_payment_requests_deny_direct_access on public.ad_payment_requests;
create policy ad_payment_requests_deny_direct_access on public.ad_payment_requests
  for all to public using (false) with check (false);

-- ---------------------------------------------------------------------------
-- 2. Instructions shown to the advertiser
-- ---------------------------------------------------------------------------
create or replace function public.ad_payment_instructions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.mk_require_uid();
  return jsonb_build_object(
    'bikash_number', bsdc.mk_setting('bikash_number'),
    'min_budget_poisha', 10000,
    'max_budget_poisha', 10000000,
    'min_bid_poisha', coalesce((select value::text::integer from public.site_config
                                 where key = 'ads.min_bid'), 100),
    'max_bid_poisha', 1000000,
    'daily_cap_min_poisha', 1000
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The advertiser builds a campaign (one transaction, all or nothing)
-- ---------------------------------------------------------------------------
create or replace function public.ad_create_campaign(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid        text := bsdc.mk_require_uid();
  v_name       text := btrim(coalesce(p->>'name', ''));
  v_pricing    text := coalesce(p->>'pricing', '');
  v_bid        integer := (p->>'bid')::integer;
  v_budget     integer := (p->>'total_budget')::integer;
  v_daily      integer := coalesce(nullif(p->>'daily_budget', '')::integer, 0);
  v_min_bid    integer;
  v_starts     timestamptz;
  v_ends       timestamptz := nullif(p->>'ends_at', '')::timestamptz;
  v_language   text := coalesce(nullif(btrim(coalesce(p->>'language', '')), ''), 'any');
  v_placement  text := coalesce(p->>'placement', '');
  v_headline   text := btrim(coalesce(p->>'headline', ''));
  v_body       text := coalesce(p->>'body', '');
  v_target     text := btrim(coalesce(p->>'target_url', ''));
  v_image      text := btrim(coalesce(p->>'image_url', ''));
  v_cta        text := btrim(coalesce(p->>'cta_label', ''));
  v_layout     text := coalesce(nullif(btrim(coalesce(p->>'layout', '')), ''), 'card');
  v_platforms  text[];
  v_cities     text[];
  v_topics     text[];
  v_id         uuid;
  v_drafts     integer;
begin
  select count(*) into v_drafts from public.ad_campaigns
   where owner_uid = v_uid and status = 'draft';
  if v_drafts >= 20 then
    raise exception 'You already have 20 unfinished campaigns; fund or remove one first'
      using errcode = '22023';
  end if;

  if char_length(v_name) not between 3 and 80 then
    raise exception 'The campaign name must be between 3 and 80 characters' using errcode = '22023';
  end if;
  if v_pricing not in ('cpm', 'cpc') then
    raise exception 'Choose pricing per 1,000 views or per click' using errcode = '22023';
  end if;

  select coalesce((select value::text::integer from public.site_config where key = 'ads.min_bid'), 100)
    into v_min_bid;
  if v_bid is null or v_bid < v_min_bid or v_bid > 1000000 then
    raise exception 'The bid must be between % and 1000000 poisha', v_min_bid using errcode = '22023';
  end if;
  if v_budget is null or v_budget < 10000 or v_budget > 10000000 then
    raise exception 'The budget must be between ৳100 and ৳100,000' using errcode = '22023';
  end if;
  if v_daily <> 0 and (v_daily < 1000 or v_daily > v_budget) then
    raise exception 'A daily cap must be zero (no cap) or between ৳10 and the whole budget'
      using errcode = '22023';
  end if;

  v_starts := greatest(coalesce(nullif(p->>'starts_at', '')::timestamptz, now()), now());
  if v_ends is not null and (v_ends <= v_starts or v_ends > v_starts + interval '365 days') then
    raise exception 'The end date must be after the start date and within a year' using errcode = '22023';
  end if;
  if v_language not in ('any', 'bn', 'en') then
    raise exception 'Choose a language: any, Bangla or English' using errcode = '22023';
  end if;

  if v_placement not in ('feed', 'sidebar', 'shop', 'search', 'article') then
    raise exception 'Choose where the ad appears' using errcode = '22023';
  end if;

  v_platforms := coalesce(
    array(select jsonb_array_elements_text(p->'platforms')),
    array['web', 'android']::text[]
  );
  v_cities := coalesce(array(select jsonb_array_elements_text(p->'cities')), '{}'::text[]);
  v_topics := coalesce(array(select jsonb_array_elements_text(p->'topics')), '{}'::text[]);

  -- The creative is checked by the same rules staff use for their own copy.
  perform bsdc.validate_ad_creative_fields(
    v_headline, v_body, v_target, v_image, '', coalesce(p->>'image_alt', ''), v_cta,
    v_layout, coalesce(p->>'accent_color', ''), coalesce(p->>'badge_label', ''), v_platforms
  );

  insert into public.ad_campaigns (
    owner_uid, name, status, pricing, bid, total_budget, daily_budget,
    starts_at, ends_at, target_cities, target_topics, target_language
  ) values (
    v_uid, v_name, 'draft', v_pricing::bsdc_ad_pricing, v_bid, v_budget, v_daily,
    v_starts, v_ends, v_cities, v_topics, v_language
  )
  returning id into v_id;

  insert into public.ad_creatives (
    campaign_id, placement, headline, body, target_url, image_url, cta_label,
    thumb_url, image_alt, layout, accent_color, badge_label, platforms
  ) values (
    v_id, v_placement::bsdc_ad_placement, v_headline, v_body, v_target, v_image, v_cta,
    '', btrim(coalesce(p->>'image_alt', '')), v_layout,
    btrim(coalesce(p->>'accent_color', '')), btrim(coalesce(p->>'badge_label', '')), v_platforms
  );

  perform bsdc.audit('campaign.self_create', v_id::text, jsonb_build_object(
    'owner', v_uid, 'budget', v_budget, 'bid', v_bid, 'pricing', v_pricing));
  return jsonb_build_object('campaign_id', v_id, 'status', 'draft');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The advertiser reports the bKash payment for a campaign's budget
-- ---------------------------------------------------------------------------
create or replace function public.ad_submit_payment(
  p_campaign_id uuid,
  p_sender      text,
  p_account     text,
  p_txn         text
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid     text := bsdc.mk_require_uid();
  v_c       public.ad_campaigns%rowtype;
  v_sender  text := regexp_replace(coalesce(p_sender, ''), '[\s-]', '', 'g');
  v_id      uuid;
begin
  -- A campaign that is not this advertiser's is indistinguishable from one
  -- that does not exist.
  select * into v_c from public.ad_campaigns
   where id = p_campaign_id and owner_uid = v_uid for update;
  if not found then
    raise exception 'No such campaign' using errcode = 'P0002';
  end if;
  if v_c.status <> 'draft' then
    raise exception 'Only a campaign still in draft can be paid for' using errcode = '22023';
  end if;
  if v_sender ~ '^\+?880' then
    v_sender := '0' || substr(regexp_replace(v_sender, '^\+?880', ''), 1);
  end if;
  if v_sender !~ '^01[3-9][0-9]{8}$' then
    raise exception 'Enter the Bangladeshi mobile number you paid from' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_account, ''))) not between 2 and 80 then
    raise exception 'Enter the account holder name as it appears on bKash' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_txn, ''))) not between 4 and 40 then
    raise exception 'Enter the bKash transaction ID' using errcode = '22023';
  end if;
  if exists (select 1 from public.ad_payment_requests
              where campaign_id = p_campaign_id and status = 'pending') then
    raise exception 'A payment for this campaign is already waiting for review' using errcode = '22023';
  end if;
  if exists (select 1 from public.ad_payment_requests
              where lower(btrim(txn_id)) = lower(btrim(p_txn))) then
    raise exception 'That transaction ID has already been used' using errcode = '22023';
  end if;

  insert into public.ad_payment_requests (
    owner_uid, campaign_id, amount_poisha, sender_number, account_holder, txn_id
  ) values (
    v_uid, p_campaign_id, v_c.total_budget, v_sender, btrim(p_account), btrim(p_txn)
  )
  returning id into v_id;

  perform bsdc.audit('ad_payment.submit', v_id::text, jsonb_build_object(
    'campaign', p_campaign_id, 'amount', v_c.total_budget));
  return jsonb_build_object('request_id', v_id, 'status', 'pending');
exception
  when unique_violation then
    raise exception 'That transaction ID has already been used' using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The advertiser's own requests and campaigns
-- ---------------------------------------------------------------------------
create or replace function public.ad_my_payment_requests(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.mk_require_uid();
begin
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc)
      from (
        select r.id, r.campaign_id, r.amount_poisha, r.txn_id, r.status,
               r.review_note, r.created_at, r.decided_at
          from public.ad_payment_requests r
         where r.owner_uid = v_uid
         order by r.created_at desc
         limit least(greatest(p_limit, 1), 100)
      ) x
  ), '[]'::jsonb);
end;
$$;

-- The owner sends a funded draft to staff for creative review. The wallet
-- must already cover the budget: the same promise staff approval relies on.
create or replace function public.ad_owner_submit_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid     text := bsdc.mk_require_uid();
  v_c       public.ad_campaigns%rowtype;
  v_balance bigint;
begin
  select * into v_c from public.ad_campaigns
   where id = p_campaign_id and owner_uid = v_uid for update;
  if not found then
    raise exception 'No such campaign' using errcode = 'P0002';
  end if;
  if v_c.status not in ('draft', 'rejected') then
    raise exception 'Only a draft or rejected campaign can be sent for review' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ad_creatives c where c.campaign_id = p_campaign_id and c.is_enabled) then
    raise exception 'A campaign needs at least one creative' using errcode = '22023';
  end if;
  v_balance := bsdc.ad_uncommitted_balance(v_uid, p_campaign_id);
  if v_balance < v_c.total_budget - v_c.spent then
    raise exception 'Your payment is not approved yet, so the wallet cannot cover this budget'
      using errcode = '22023';
  end if;
  update public.ad_campaigns set status = 'pending_review', review_note = '' where id = p_campaign_id;
  perform bsdc.audit('campaign.owner_submit', p_campaign_id::text, '{}'::jsonb);
  return jsonb_build_object('campaign_id', p_campaign_id, 'status', 'pending_review');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Ads staff review payments
-- ---------------------------------------------------------------------------
create or replace function public.ad_admin_list_payment_requests(
  p_status text default 'pending',
  p_limit  integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.mk_require_uid();
  perform bsdc.mk_require_staff_permission('ads.manage');
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.created_at)
      from (
        select r.id, r.owner_uid, r.campaign_id, r.amount_poisha, r.sender_number,
               r.account_holder, r.txn_id, r.status, r.created_at
          from public.ad_payment_requests r
         where r.status = p_status
         order by r.created_at
         limit least(greatest(p_limit, 1), 200)
      ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.ad_admin_decide_payment_request(
  p_request_id uuid,
  p_decision   text,
  p_note       text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.mk_require_uid();
  v_r   public.ad_payment_requests%rowtype;
  v_c   public.ad_campaigns%rowtype;
begin
  perform bsdc.mk_require_staff_permission('ads.manage');
  select * into v_r from public.ad_payment_requests where id = p_request_id for update;
  if not found then
    raise exception 'payment request not found' using errcode = 'P0002';
  end if;
  if v_r.status <> 'pending' then
    raise exception 'this payment was already decided' using errcode = '22023';
  end if;

  if p_decision = 'reject' then
    if char_length(btrim(coalesce(p_note, ''))) < 5 then
      raise exception 'write a reason of at least 5 characters' using errcode = '22023';
    end if;
    update public.ad_payment_requests
       set status = 'rejected', review_note = left(p_note, 500), decided_by = v_uid, decided_at = now()
     where id = v_r.id;
    perform bsdc.notify(v_r.owner_uid, v_uid, 'moderation', null, null,
      'Your advertising payment was not accepted');
    perform bsdc.audit('ad_payment.reject', v_r.id::text, jsonb_build_object('note', left(p_note, 500)));
    return jsonb_build_object('request_id', v_r.id, 'status', 'rejected');
  elsif p_decision <> 'approve' then
    raise exception 'decision must be approve or reject' using errcode = '22023';
  end if;

  select * into v_c from public.ad_campaigns where id = v_r.campaign_id for update;
  if not found or v_c.status <> 'draft' then
    raise exception 'the campaign is no longer a draft, so this payment cannot be credited'
      using errcode = '22023';
  end if;

  update public.ad_payment_requests
     set status = 'approved', decided_by = v_uid, decided_at = now()
   where id = v_r.id;

  insert into public.ad_wallet_entries (owner_uid, campaign_id, kind, amount, memo, reference)
  values (v_r.owner_uid, v_r.campaign_id, 'topup', v_r.amount_poisha,
          'Campaign funding by bKash', v_r.txn_id);

  perform bsdc.notify(v_r.owner_uid, v_uid, 'moderation', null, null,
    'Your payment is approved. Send your campaign for review.');
  perform bsdc.audit('ad_payment.approve', v_r.id::text, jsonb_build_object(
    'amount', v_r.amount_poisha, 'campaign', v_r.campaign_id));
  return jsonb_build_object('request_id', v_r.id, 'status', 'approved');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6b. Money is promised once. A wallet balance is shared by all of an owner's
--     campaigns, so a budget that is already live, paused or in review is
--     reserved before another campaign may draw on the same balance.
-- ---------------------------------------------------------------------------
create or replace function bsdc.ad_uncommitted_balance(p_owner text, p_exclude uuid)
returns bigint
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select coalesce((select sum(amount) from public.ad_wallet_entries where owner_uid = p_owner), 0)
       - coalesce((select sum(c.total_budget - c.spent) from public.ad_campaigns c
                    where c.owner_uid = p_owner
                      and c.status in ('active', 'paused', 'pending_review')
                      and c.id is distinct from p_exclude), 0);
$$;
revoke all on function bsdc.ad_uncommitted_balance(text, uuid) from public, anon, authenticated;

-- decide_campaign as it stands in 0078, with the reserved-money check. The
-- ledger and the staff rules are unchanged; only the balance test is stricter.
create or replace function public.decide_campaign(
  p_campaign_id uuid,
  p_approve boolean,
  p_note text default ''
)
returns bsdc_ad_status
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_campaign public.ad_campaigns%rowtype;
  v_status bsdc_ad_status;
begin
  perform bsdc.require_permission('ads.manage');
  select * into v_campaign from public.ad_campaigns where id = p_campaign_id for update;
  if not found then raise exception 'No such campaign' using errcode = 'P0002'; end if;
  if v_campaign.status <> 'pending_review' then
    raise exception 'Only a campaign awaiting review can be decided' using errcode = '22023';
  end if;
  if p_approve then
    if not exists (select 1 from public.ad_creatives c where c.campaign_id = p_campaign_id and c.is_enabled) then
      raise exception 'A campaign needs an enabled creative before approval' using errcode = '22023';
    end if;
    if bsdc.ad_uncommitted_balance(v_campaign.owner_uid, p_campaign_id) < v_campaign.total_budget - v_campaign.spent then
      raise exception 'Credit the wallet before approving this budget: other live campaigns already reserve it'
        using errcode = '22023';
    end if;
    v_status := 'active';
  else
    if btrim(coalesce(p_note, '')) = '' then
      raise exception 'A refusal needs a reason' using errcode = '22023';
    end if;
    v_status := 'rejected';
  end if;
  update public.ad_campaigns set status = v_status, review_note = coalesce(p_note, '')
   where id = p_campaign_id;
  perform bsdc.audit('campaign.decide', p_campaign_id::text,
    jsonb_build_object('approved', p_approve, 'note', coalesce(p_note, '')));
  perform bsdc.notify(v_campaign.owner_uid, bsdc.current_uid(), 'moderation', null, null,
    case when p_approve then 'Your campaign is live' else 'Your campaign was not approved' end);
  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants. A new SECURITY DEFINER function is executable by PUBLIC unless
--    it is revoked, so every one is revoked first.
-- ---------------------------------------------------------------------------
revoke all on function public.ad_payment_instructions() from public, anon;
revoke all on function public.ad_create_campaign(jsonb) from public, anon;
revoke all on function public.ad_submit_payment(uuid, text, text, text) from public, anon;
revoke all on function public.ad_my_payment_requests(integer) from public, anon;
revoke all on function public.ad_owner_submit_campaign(uuid) from public, anon;
revoke all on function public.ad_admin_list_payment_requests(text, integer) from public, anon;
revoke all on function public.ad_admin_decide_payment_request(uuid, text, text) from public, anon;

grant execute on function public.ad_payment_instructions() to authenticated, service_role;
grant execute on function public.ad_create_campaign(jsonb) to authenticated, service_role;
grant execute on function public.ad_submit_payment(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.ad_my_payment_requests(integer) to authenticated, service_role;
grant execute on function public.ad_owner_submit_campaign(uuid) to authenticated, service_role;
grant execute on function public.ad_admin_list_payment_requests(text, integer) to authenticated, service_role;
grant execute on function public.ad_admin_decide_payment_request(uuid, text, text) to authenticated, service_role;
